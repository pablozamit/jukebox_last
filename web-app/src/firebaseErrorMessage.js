export function firebaseErrorMessage(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return 'Firebase ha rechazado la operación por permisos. Las reglas de Firestore pueden estar desactualizadas.';
  if (code.includes('auth/operation-not-allowed')) return 'El método de acceso está desactivado en Firebase Authentication.';
  if (code.includes('auth/unauthorized-domain')) return 'Este dominio no está autorizado en Firebase Authentication.';
  if (code.includes('auth/network-request-failed') || code.includes('unavailable')) return 'No se puede conectar con Firebase. Comprueba la red e inténtalo de nuevo.';
  if (code.includes('failed-precondition')) return 'Firebase necesita una configuración pendiente. Revisa la base de datos o sus índices.';
  if (code.includes('resource-exhausted')) return 'Firebase ha alcanzado su cuota temporal. Inténtalo de nuevo más tarde.';
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}
