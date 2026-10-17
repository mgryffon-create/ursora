import React,{useEffect,useState} from 'react';
import db from '@/lib/db';
type Settings={beta_access_enabled:boolean;checkout_enabled:boolean};
type Subscription={status:string;stripe_price_id:string|null;current_period_end:string|null;cancel_at_period_end:boolean};
export default function UniversityBilling(){
 const [settings,setSettings]=useState<Settings|null>(null);
 const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
 const [loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void (async()=>{
  const [config,memberships]=await Promise.all([
   db.from('billing_settings').select('beta_access_enabled,checkout_enabled').eq('id',true).single(),
   db.from('billing_subscriptions').select('status,stripe_price_id,current_period_end,cancel_at_period_end')
  ]);
  if(!alive)return;
  if(config.error||memberships.error)setError('Billing information is temporarily unavailable.');
  else {setSettings(config.data);setSubscriptions(memberships.data??[]);}
  setLoading(false);
 })();return()=>{alive=false};},[]);
 const paid=subscriptions.some(s=>['active','trialing'].includes(s.status) && (!s.current_period_end||new Date(s.current_period_end)>new Date()));
 const call=async(action:'checkout'|'portal',interval?:'monthly'|'annual')=>{
  setPending(true);setError('');
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw new Error('Sign in to manage a subscription.');
   const response=await fetch('https://xnwpkoddbdkzrodubtyi.supabase.co/functions/v1/ursora-billing',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify({action,interval})
   });
   const data=await response.json();
   if(!response.ok||!data.url)throw new Error(data.error??'Billing request failed.');
   const url=new URL(data.url);
   if(url.protocol!=='https:'||!(url.hostname==='checkout.stripe.com'||url.hostname.endsWith('.stripe.com')))throw new Error('Unexpected billing destination.');
   window.location.assign(url.href);
  }catch(e){setError(e instanceof Error?e.message:'Unable to open billing.');setPending(false);}
 };
 return <section className="learn-panel space-y-3" aria-label="URSORA U membership">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">URSORA U membership</h2><span className="text-xs text-sky-300">{loading?'Loading…':paid?'Paid membership':settings?.beta_access_enabled?'Free public beta':'Subscription access'}</span></div>
  <p className="text-sm text-zinc-300">{settings?.beta_access_enabled?'All learning modules remain free during beta. Your progress will be saved. No payment information is required.':paid?'Your subscription is active.':loading?'Checking membership…':'Subscriptions will be offered when enrollment opens.'}</p>
  <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-md border border-zinc-700 p-3"><strong>$19.99 / month</strong><p className="text-xs text-zinc-400">Full URSORA U curriculum and exercises</p><button disabled={!settings?.checkout_enabled||pending} onClick={()=>void call('checkout','monthly')}>Subscribe monthly</button></div>
   <div className="rounded-md border border-zinc-700 p-3"><strong>$179 / year</strong><p className="text-xs text-zinc-400">Same membership, annual billing</p><button disabled={!settings?.checkout_enabled||pending} onClick={()=>void call('checkout','annual')}>Subscribe annually</button></div></div>
  {!settings?.checkout_enabled&&<p className="text-xs text-zinc-400">Paid enrollment is not open yet. Beta members will be notified before paid access begins.</p>}
  {subscriptions.length>0&&<button disabled={pending} onClick={()=>void call('portal')}>Manage subscription and invoices</button>}
  {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
 </section>;
}
