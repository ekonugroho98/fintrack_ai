import { handleRegister } from './handlers/registerHandler.js';
import { handleInvite } from './handlers/inviteHandler.js';
import { handleTransaction } from './handlers/transactionHandler.js';

export default async function processText(data) {
  const { from, text } = data;
  
  if (text.toUpperCase().startsWith('DAFTAR#')) {
    return handleRegister(data);
  }
  
  if (text.toUpperCase().startsWith('INVITE#')) {
    return handleInvite(data);
  }
  
  return handleTransaction(data);
}
