import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createInbox, type Account, type Conversation, type Message } from '../../../../packages/attention/src/inbox.ts';
import { ALPHA_API, ALPHA_DEMO } from './alpha-mode';
import { useCustomization } from './customization';
import { useAccount } from './account';
import { t } from './i18n';

function useInboxModel() {
  const session=useAccount();
  const customization=useCustomization();
  const enabled=customization.enabled('inbox');
  const scope=`${customization.scope}:${enabled}`;
  const active=useRef(scope);
  const generation=useRef(0);
  if(active.current!==scope){active.current=scope;generation.current++;}
  const [dataScope,setDataScope]=useState(scope);
  const api=useMemo(()=>ALPHA_DEMO||!enabled?null:createInbox(session,fetch,ALPHA_API),[session.getToken,session.unauthorized,enabled]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [account,setAccount]=useState<Account|null>(null);
  const [rows,setRows]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [more,setMore]=useState(false);
  const [older,setOlder]=useState(false);
  const [error,setError]=useState('');
  const clear=()=>{generation.current++;setDataScope(scope);setAccounts([]);setAccount(null);setRows([]);setSelected(null);setMessages([]);setConsent(false);setBusy(false);setMore(false);setOlder(false);setError('');};
  useEffect(()=>{
    clear();
    if(ALPHA_DEMO){if(enabled)setRows([{id:1,account_id:1,contact_name:t('alpha.customer'),channel_name:t('alpha.channel'),last_message:t('alpha.message'),ai_assistance:true,unread_count:1}]);return;}
    if(!enabled)return;
    if(session.session)void connect();
    return()=>{generation.current++;};
  },[session.session?.user.id,scope]);
  async function connect(){
    if(!api||!enabled||active.current!==scope)return;clear();setConsent(true);setBusy(true);const request=generation.current;
    try{const value=await api.accounts();if(request===generation.current){setAccounts(value);if(value.length===1)void selectAccount(value[0]);}}
    catch(cause){if(request===generation.current)setError(cause instanceof Error?cause.message:'');}
    finally{if(request===generation.current)setBusy(false);}
  }
  async function selectAccount(value:Account,append=false){
    if(!api||!enabled||active.current!==scope)return;const request=++generation.current;setAccount(value);setSelected(null);setMessages([]);setOlder(false);setBusy(true);setError('');if(!append){setRows([]);setMore(false);}
    try{const page=await api.conversations(value.id,append?rows.length:0);if(request===generation.current){setRows(previous=>append?[...previous,...page.rows]:page.rows);setMore(page.hasMore);}}
    catch(cause){if(request===generation.current)setError(cause instanceof Error?cause.message:'');}
    finally{if(request===generation.current)setBusy(false);}
  }
  async function open(value:Conversation,previous=false){
    if(!enabled||active.current!==scope)return;
    const request=++generation.current;setSelected(value);setError('');if(!previous){setMessages([]);setOlder(false);}
    if(ALPHA_DEMO){setMessages([{id:1,conversation_id:value.id,content:t('alpha.message'),direction:'inbound',sender_type:'contact'},{id:2,conversation_id:value.id,content:t('alpha.reply'),direction:'outbound',sender_type:'ai-agent'}]);return;}
    if(!api||!account)return;setBusy(true);
    try{const page=await api.messages(account.id,value.id,previous?messages[0]?.id:undefined);if(request===generation.current){setMessages(old=>previous?[...page.rows,...old]:page.rows);setOlder(page.hasMore);}}
    catch(cause){if(request===generation.current)setError(cause instanceof Error?cause.message:'');}
    finally{if(request===generation.current)setBusy(false);}
  }
  const visible=enabled&&dataScope===scope;
  return{accounts:visible?accounts:[],account:visible?account:null,rows:visible?rows:[],selected:visible?selected:null,messages:visible?messages:[],consent:visible&&consent,busy:visible&&busy,more:visible&&more,older:visible&&older,error:visible?error:'',connect,selectAccount,open};
}
const Context=createContext<ReturnType<typeof useInboxModel>|null>(null);
export function InboxProvider({children}:{children:ReactNode}){const value=useInboxModel();return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useInbox(){const value=useContext(Context);if(!value)throw new Error('InboxProvider missing');return value;}
