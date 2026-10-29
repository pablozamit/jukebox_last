import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const invokeSocialAction = httpsCallable(functions, 'socialAction', { timeout: 12000 });

export async function socialRequest(action, payload = {}) {
  const result = await invokeSocialAction({ action, ...payload });
  return result.data;
}
