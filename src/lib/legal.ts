import db from '@/lib/db';
import content from './legal-notice.md?raw';
export const LEGAL_VERSION = '2026-10-19.1';
export const LEGAL_CONTENT = content;
export async function legalReceipt(action: 'first_login_notice' | 'terms_acceptance') {
  const {error} = await db.rpc('record_legal_receipt', {p_version:LEGAL_VERSION,p_action:action});
  if(error) throw error;
}
export async function needsLegalNotice() {
  const {data,error}=await db.from('legal_receipts').select('action').eq('version',LEGAL_VERSION);
  if(error) throw error;
  const actions=new Set((data??[]).map(r=>r.action));
  return {notice:!actions.has('first_login_notice'),terms:!actions.has('terms_acceptance')};
}
