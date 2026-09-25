export function pendingInvitationRole(): 'tenant' | 'arbitrator' | null {
  if (typeof window === 'undefined') return null;
  const invitation = new URLSearchParams(window.location.hash.slice(1)).get('invitation');
  if (!invitation || invitation.length > 512) return null;
  try {
    const role = (JSON.parse(invitation) as { role?: unknown }).role;
    return role === 'tenant' || role === 'arbitrator' ? role : null;
  } catch {
    return null;
  }
}
