import React, {useState} from 'react';
import db from '@/lib/db';
import {useAuth} from '@/contexts/AuthContext';
export default function PasswordRecovery(){
 const {user,loading}=useAuth();
 const [password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 async function submit(event:React.FormEvent){
  event.preventDefault();setMessage('');
  if(password!==repeat){setMessage('Passwords do not match.');return;}
  setBusy(true);
  try{
   const {error}=await db.auth.updateUser({password});if(error)throw error;
   const result=await db.auth.signOut({scope:'global'});if(result.error){setDone(true);setPassword('');setRepeat('');setMessage('Password changed, but session sign-out could not be confirmed. Sign out manually from Account & security.');return;}
   setDone(true);setPassword('');setRepeat('');setMessage('Password updated and sessions signed out. Sign in with your new password.');
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to reset password. Request a fresh recovery link.');}
  finally{setBusy(false);}
 }
 return <main className="min-h-screen bg-zinc-950 p-6 text-zinc-200"><form className="mx-auto max-w-md space-y-4" onSubmit={submit}><h1 className="text-2xl">Reset your password</h1>{loading?<p>Checking your recovery link…</p>:user&&!done?<><p>Choose a unique password of at least 12 characters.</p><label>New password<input type="password" required minLength={12} autoComplete="new-password" className="block w-full rounded border bg-zinc-900 p-2" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm password<input type="password" required minLength={12} autoComplete="new-password" className="block w-full rounded border bg-zinc-900 p-2" value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><button disabled={busy} className="rounded border p-2">Save new password & sign out sessions</button></>:!done&&<p>Your recovery link is missing, expired or already used. Return to sign in and request a new link.</p>}{message&&<p role="status">{message}</p>}<a href="/" className="block text-sky-300 underline">Return to sign in</a></form></main>;
}
