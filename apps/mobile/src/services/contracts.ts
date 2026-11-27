import { EventRoom, InviteInput, Profile, Snapshot, ThemeId } from '@unicore/shared';

// The UI uses the same contract for remote data and the explicit offline mock mode
export interface CampusRepository {
  room(id: string): Promise<EventRoom>;
  setCohost(id: string, userId: string, enabled: boolean): Promise<Snapshot>;
  postMessage(id: string, body: string): Promise<void>;
  removeMember(id: string, userId: string): Promise<Snapshot>;
  load(): Promise<Snapshot>;
  signIn(email: string, password?: string, portal?: 'student' | 'partner'): Promise<Snapshot>;
  signUp(
    email: string,
    password: string,
    name: string,
    partner?: { company: string; code: string },
  ): Promise<Snapshot>;
  issuePartnerCode(): Promise<string>;
  resendConfirmation(email: string): Promise<void>;
  subscribe?(listener: () => void): () => void;
  signOut(): Promise<Snapshot>;
  updateProfile(profile: Profile): Promise<Snapshot>;
  setTheme(theme: ThemeId): Promise<Snapshot>;
  toggleSaved(id: string, saved?: boolean): Promise<Snapshot>;
  toggleJoined(id: string, joined?: boolean): Promise<Snapshot>;
  createInvite(input: InviteInput): Promise<Snapshot>;
  reset(): Promise<Snapshot>;
}
