export interface GeneralEntry {
  id: string;
  title: string;
  type: 'Series' | 'Movie';
  year: string;
  country: string;
  status: 'COMPLETE' | 'ONGOING' | 'DROPPED' | 'INCOMPLETE';
  poster: string;
  isFavorite: boolean;
  inTop10: boolean;
}

export interface OngoingEntry {
  episode: string;
  totalEpisodes: string;
  day: string;
  countryOverride: string | null;
}

export interface FavoritesEntry {
  ratings: {
    storyline: number;
    acting: number;
    music: number;
    cinematography: number;
    ending: number;
  };
  gapPreferences: Record<string, boolean>;
  overallRating: string;
}

export interface AppData {
  generalList: GeneralEntry[];
  ongoingData: Record<string, OngoingEntry>;
  favoritesData: Record<string, FavoritesEntry>;
  top10Rankings: Record<string, string[]>;
}

export type TabType = 'general' | 'ongoing' | 'favorites' | 'top10';
export type SortField = 'title' | 'type' | 'year' | 'country' | 'status';
export type SortDir = 'asc' | 'desc';
