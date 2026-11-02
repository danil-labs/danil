import { render } from 'solid-js/web';
import { aplicarLengua, aplicarLenguaDeWorkspace, t } from '../../lib/i18n';
import { Button } from '../../ui/Button';
import '../phrases';
import '../../styles/global.css';
import '../../lib/sharedClock';

export async function startAttention(settings: { login: string }) {
  const query = new URLSearchParams(location.search);
  if (query.get('demo') === '1') {
    const [{ installDemo }, { setCapabilities }, { attentionCapability }, { supportAccessDemo }, { personalAccountDemo }] = await Promise.all([import('./demo'), import('../../lib/platform'), import('./capability'), import('./support-access'), import('../admin/personal-demo')]);
    const personal = query.get('account') === 'personal';
    aplicarLenguaDeWorkspace(null);
    const ordinary = query.get('ordinary') === '1';
    installDemo({workspace:t('web.alpha.demo_workspace'),space:t('web.alpha.demo_space'),folder:t('web.alpha.demo_folder'),task:t('web.alpha.demo_task'),answer:t('web.alpha.demo_answer'),denied:t('web.alpha.demo_denied')}, {dark:query.get('theme')==='dark',ordinary});
    setCapabilities({nativeWindow:false,updater:false,localSetup:false,computerStatus:false,inbox: ordinary ? undefined : attentionCapability(true,true),supportAccess: ordinary ? undefined : supportAccessDemo(t('web.alpha.demo_workspace')),personalAccount: personal ? personalAccountDemo() : undefined,initialSettings: query.get('settings') ?? undefined,adminPage: ordinary ? undefined : {href: `${import.meta.env.BASE_URL}admin?demo=1${query.get('theme')==='dark'?'&theme=dark':''}`,allowed:async()=>!personal}});
    await import('../../app/main');
    return;
  }
  aplicarLengua();
  const { seguirElTema } = await import('../../lib/theme');
  seguirElTema();
  render(() => <main class="flex h-full flex-col items-start gap-4 overflow-y-auto bg-bg p-8 text-neutral-950"><h1 class="font-display text-2xl font-bold">{t('alpha.inbox')}</h1><p class="max-w-xl text-sm">{t('web.alpha.validation_warning')} {t('web.alpha.production_warning')}</p><Button as="a" href={`${import.meta.env.BASE_URL}inbox?live=1`}>{t('web.alpha.connect')}</Button><Button as="a" variant="secondary" href={`${import.meta.env.BASE_URL}inbox?demo=1`}>{t('web.alpha.demo')}</Button><Button as="a" variant="ghost" href={settings.login}>{t('web.alpha.signin')}</Button></main>, document.getElementById('root')!);
}
