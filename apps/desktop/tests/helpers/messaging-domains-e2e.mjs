import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { platformMessaging } from '../../src/web/platform-messaging.ts';

export async function messagingDomainsE2E({ db, messaging, browserFetch }) {
  const api = platformMessaging({ origin: 'https://api.danil.ai', timeoutMs: 5000 }, browserFetch);
  await db.admin.query(`UPDATE tenancy.client_grants SET scopes=array_cat(scopes,ARRAY['campaigns.manage','channels.manage']) WHERE audience='workers';
    UPDATE tenancy.access_projection SET scopes=array_cat(scopes,ARRAY['campaigns.manage','channels.manage']),verified_at=now(),valid_until=now()+interval '30 seconds';
    UPDATE identity.access_projection SET scopes=array_cat(scopes,ARRAY['campaigns.manage','channels.manage']),verified_at=now(),valid_until=now()+interval '30 seconds';
    UPDATE tenancy.client_grants SET valid_until=now()+interval '30 seconds';
    INSERT INTO public.features(key,name) VALUES ('campaigns','Campaigns') ON CONFLICT DO NOTHING;
    INSERT INTO public.account_entitlements(account_id,feature_key,source) VALUES (9007199254740993,'campaigns','manual');`);
  await messaging.syncProjection();
  const contact = await api.saveContact({ name: 'W5 contact', phone: '+5215551234567' }, 'w5-contact');
  assert.deepEqual(await api.saveContact({ name: 'W5 contact', phone: '+5215551234567' }, 'w5-contact'), contact);
  assert.equal((await api.saveContact({ name: 'W5 edited' }, 'w5-contact-edit', contact.id)).name, 'W5 edited');
  await db.admin.query("INSERT INTO public.channels(account_id,name,provider,ai_active) VALUES (9007199254740993,'W5 web','web',false)");
  const ch = (await db.admin.query("INSERT INTO public.channels(account_id,name,provider,ai_active) VALUES (9007199254740993,'W5 WhatsApp','whatsapp_cloud',false) RETURNING id")).rows[0].id;
  await db.admin.query("INSERT INTO public.connection_credentials_cloud(channel_id,waba_id,phone_number_id,connection_status) VALUES ($1,'w5-waba','w5-phone','active')", [ch]);
  const channel_id = messaging.ids('ch', [Number(ch)])[0];
  const draft = { name: 'w5_saludo', language: 'es_MX', category: 'utility', channel_ids: [channel_id], components: { header: null, body: { text: 'Hola' }, footer: null } };
  const template = await api.saveTemplate(draft, 'w5-template');
  assert.equal(template.status, 'draft');
  assert.deepEqual(template.channel_ids, [channel_id]);
  assert.equal((await api.saveTemplate({ ...draft, components: { ...draft.components, body: { text: 'Hola de nuevo' } } }, 'w5-template-edit', template.id)).components.body.text, 'Hola de nuevo');
  await db.admin.query("UPDATE public.templates SET status='APPROVED' WHERE name='w5_saludo'");
  const campaign = await api.createCampaign({ name: 'W5 campaign', template_id: template.id, channel_id }, 'w5-campaign');
  assert.equal(campaign.status, 'draft');
  const audience = await api.audience(campaign.id, [contact.id], 'w5-audience');
  assert.equal(audience.added, 1);
  assert.equal((await api.audience(campaign.id, [contact.id], 'w5-audience')).added, 1);
  assert.equal((await api.campaignAction(campaign.id, 'schedule', { send_at: new Date(Date.now() + 3600000).toISOString() }, 'w5-schedule')).status, 'scheduled');
  assert.equal((await api.campaignAction(campaign.id, 'start', {}, 'w5-start')).status, 'running');
  assert.equal((await api.campaignAction(campaign.id, 'pause', {}, 'w5-pause')).status, 'paused');
  assert.equal((await api.campaignAction(campaign.id, 'cancel', {}, 'w5-cancel')).status, 'cancelled');
  for (const domain of ['channels','templates','campaigns','contacts']) assert.ok((await api[domain]()).data.length > 0, domain);
  if (process.env.DANIL_MESSAGING_BROWSER_URL || process.env.DANIL_INBOX_BROWSER_URL) {
    await browser(browserFetch);
    assert.deepEqual((await db.admin.query("SELECT name,count(*)::int AS n FROM public.contact_accounts WHERE name LIKE 'Browser contact %' GROUP BY name ORDER BY name")).rows, [{ name: 'Browser contact 1280', n: 1 }, { name: 'Browser contact 390', n: 1 }]);
  }
  return 'real edge/identity/workspaces/workers + PostgreSQL: contacts upsert/PATCH, channels read, templates POST/PATCH, campaign create/audience/idempotency/schedule/pause/cancel' + (process.env.DANIL_MESSAGING_BROWSER_URL || process.env.DANIL_INBOX_BROWSER_URL ? ' and Chromium desktop/mobile' : '');
}

async function browser(browserFetch) {
  const bridge = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const call = JSON.parse(body);
      const response = await browserFetch(call.url, call.init);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }));
    } catch (cause) { res.writeHead(500); res.end(String(cause)); }
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  let child, timer;
  try {
    child = spawn(process.env.DANIL_INBOX_BROWSER_PYTHON, ['apps/desktop/tests/integration/messaging-domains.browser.py'], { env: { ...process.env, DANIL_INBOX_BROWSER_URL: process.env.DANIL_MESSAGING_BROWSER_URL ?? process.env.DANIL_INBOX_BROWSER_URL, DANIL_MESSAGING_BRIDGE: `http://127.0.0.1:${bridge.address().port}` }, stdio: ['ignore','pipe','pipe'] });
    let output = '';
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    timer = setTimeout(() => child.kill('SIGTERM'), 60000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, output);
  } finally { clearTimeout(timer); child?.kill('SIGTERM'); await new Promise(resolve => bridge.close(resolve)); }
}
