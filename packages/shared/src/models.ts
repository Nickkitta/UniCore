export const categories = ['Все', 'Учёба', 'Карьера', 'Спорт', 'Общение', 'Творчество'] as const;
export type Category = Exclude<(typeof categories)[number], 'Все'>;
export type CategoryFilter = (typeof categories)[number];
export const themeIds = ['violet', 'forest', 'light'] as const;
export type ThemeId = (typeof themeIds)[number];
export const accountKinds = ['student', 'partner'] as const;
export type AccountKind = (typeof accountKinds)[number];
/** Year of study; empty for partners and for students who haven't filled it in. */
export const courses = ['', '1', '2', '3', '4', '5', '6'] as const;
/** New activities are events; `invite` is kept for activities made before them. */
export const activityKinds = ['event', 'invite'] as const;
export type GeoPoint = { latitude: number; longitude: number };
export type PhotoDraft = { uri: string; base64: string };
export type Organization = { id: string; name: string; description: string };
export type Activity = {
  partnerBadge?: string | null;
  companyAbout?: string | null;
  id: string;
  kind: 'event' | 'invite';
  title: string;
  category: Category;
  description: string;
  startsAt: string;
  location: string;
  host: string;
  hostId: string;
  hostInfo: string;
  attendees: number;
  capacity: number;
  tags: string[];
  featured?: boolean;
  priceRub?: number;
  coordinates?: GeoPoint | null;
  photoPaths?: string[];
  photoUrls?: string[];
  organizationId?: string | null;
  organizationName?: string | null;
};
export type Profile = {
  accountKind?: 'student' | 'partner';
  company?: string;
  companyAbout?: string;
  isAdmin?: boolean;
  id: string;
  name: string;
  email: string;
  faculty: string;
  course: string;
  group: string;
  bio: string;
  interests: Category[];
  theme?: ThemeId;
};
export type Snapshot = {
  groups?: { faculty: string; group: string }[];
  version: 1;
  session: boolean;
  profile: Profile;
  activities: Activity[];
  joinedIds: string[];
  savedIds: string[];
  organizations?: Organization[];
};
export type InviteInput = Pick<
  Activity,
  | 'title'
  | 'category'
  | 'description'
  | 'startsAt'
  | 'location'
  | 'capacity'
  | 'priceRub'
  | 'coordinates'
  | 'organizationId'
> & { photos?: PhotoDraft[]; tags?: string[]; partnerBadge?: string };

export type EventRoom = {
  isCohost?: boolean;
  members: { id: string; name: string; isCohost?: boolean }[];
  messages: { id: string; name: string; body: string; sentAt: string }[];
};
