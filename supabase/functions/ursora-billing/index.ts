import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const json=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json","access-control-allow-origin":"https://ursora-tradecycle.vercel.app","access-control-allow-headers":"authorization, apikey, content-type"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"https://ursora-tradecycle.vercel.app","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"}});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const apiKey=Deno.env.get("STRIPE_SECRET_KEY");
 const supaUrl=Deno.env.get("SUPABASE_URL"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!apiKey||!supaUrl||!serviceKey||!anon)return json({error:"Billing not configured"},503);
 if(!apiKey.startsWith("sk_test_"))return json({error:"Checkout is restricted to Stripe test mode"},503);
 const auth=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"")??"";
 const userClient=createClient(supaUrl,anon);
 const {data:{user},error:authError}=await userClient.auth.getUser(auth);
 if(authError||!user)return json({error:"Sign in required"},401);
  await requireSecureAccount(req);
 const db=createClient(supaUrl,serviceKey),stripe=new Stripe(apiKey,{apiVersion:"2024-12-18.acacia"});
 const {data:settings,error:settingsError}=await db.from("billing_settings").select("checkout_enabled").eq("id",true).single();
 if(settingsError)return json({error:"Billing settings unavailable"},503);
 let input:{action?:string;interval?:string};
 try{input=await req.json()}catch{return json({error:"Invalid request"},400)}
 if(!["checkout","portal"].includes(input.action??""))return json({error:"Invalid action"},400);
 if(input.action==="checkout"&&!settings?.checkout_enabled)return json({error:"Checkout is not enabled during the free beta"},403);
 try{
  const {data:existing,error:lookupError}=await db.from("billing_customers").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();
  if(lookupError)throw lookupError;
  let customerId=existing?.stripe_customer_id;
  if(input.action==="portal"&&!customerId)return json({error:"No billing account exists yet"},404);
  if(!customerId){
   const customer=await stripe.customers.create({email:user.email,metadata:{supabase_user_id:user.id}},{idempotencyKey:"ursora-customer-"+user.id});
   customerId=customer.id;
   const {error}=await db.from("billing_customers").upsert({user_id:user.id,stripe_customer_id:customerId},{onConflict:"user_id"});
   if(error)throw error;
  }
  const origin="https://ursora-tradecycle.vercel.app";
  if(input.action==="portal"){
   const session=await stripe.billingPortal.sessions.create({customer:customerId,return_url:origin});
   return json({url:session.url});
  }
  const priceId=input.interval==="annual"?Deno.env.get("STRIPE_U_ANNUAL_PRICE_ID"):input.interval==="monthly"?Deno.env.get("STRIPE_U_MONTHLY_PRICE_ID"):null;
  if(!priceId)return json({error:"Unknown billing interval or missing price"},400);
  const price=await stripe.prices.retrieve(priceId);
  if(!price.active||price.type!=="recurring"||price.livemode)return json({error:"Price is not an active test subscription price"},400);
  const session=await stripe.checkout.sessions.create({customer:customerId,mode:"subscription",line_items:[{price:priceId,quantity:1}],success_url:origin+"/?billing=success",cancel_url:origin+"/?billing=cancelled",client_reference_id:user.id,subscription_data:{metadata:{supabase_user_id:user.id}},allow_promotion_codes:true});
  return json({url:session.url});
 }catch(error){console.error("billing error",error);return json({error:"Unable to prepare billing session"},500)}
});

// Verify the caller's MFA and agreement state with their own JWT, not service-role privileges.
async function requireSecureAccount(req: Request) {
 const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/account_api_allowed', {
  method: 'POST', headers: {'Content-Type':'application/json', apikey:Deno.env.get('SUPABASE_ANON_KEY')!, Authorization:req.headers.get('Authorization') || ''}, body:'{}'
 });
 if (!response.ok || await response.json() !== true) throw new Error('Complete account authentication and the current agreement notice before continuing.');
}

