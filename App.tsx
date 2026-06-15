import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import initialData from './data/initialData.json';
import type { GeneralEntry, FavoritesEntry, AppData, TabType, SortField, SortDir } from './types';

const STORAGE_KEY = 'bl_watchlist_data';
const DRAWER_STATE_KEY = 'bl_drawer_states';
const GAP_OPTIONS = ['Chemistry', 'Originality', 'Flow & Pacing', 'Character Depth', 'Relationship Dynamics', 'Emotional Impact', 'Rewatch Value'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ===== LOAD DATA =====
function loadData(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch { /* ignore */ }
  // Clean initial data: remove empty year drawers (Issue 3 fix)
  const data = { ...initialData } as AppData;
  const cleanedRankings: Record<string, string[]> = {};
  for (const [year, ids] of Object.entries(data.top10Rankings)) {
    if (ids.length > 0) {
      cleanedRankings[year] = ids;
    }
  }
  data.top10Rankings = cleanedRankings;
  return data;
}

function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ===== COMPUTE OVERALL RATING =====
function computeOverallRating(ratings: FavoritesEntry['ratings'], gapPrefs: Record<string, boolean>): string {
  const vals = Object.values(ratings);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const uncheckedCount = Object.values(gapPrefs).filter(v => !v).length;
  const result = avg - (uncheckedCount * 0.1);
  return Math.max(0, result).toFixed(1);
}

// ===== TOAST =====
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  // ===== STATE =====
  const [data, setData] = useState<AppData>(loadData);
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Modals
  const [generalModal, setGeneralModal] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [ongoingModal, setOngoingModal] = useState<{ open: boolean; generalId: string } | null>(null);
  const [favModal, setFavModal] = useState<{ open: boolean; generalId: string } | null>(null);
  const [detailModal, setDetailModal] = useState<string | null>(null);
  const [top10Picker, setTop10Picker] = useState<{ open: boolean; year: string }>({ open: false, year: '' });
  const [shareModal, setShareModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [top10YearSelect, setTop10YearSelect] = useState<string | null>(null);

  // Search / Filter
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDay, setFilterDay] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Drawer states
  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>(() => {
    try {
      const s = localStorage.getItem(DRAWER_STATE_KEY);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  // Import text
  const [importText, setImportText] = useState('');

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'Series' | 'Movie'>('Series');
  const [formYear, setFormYear] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formStatus, setFormStatus] = useState<'COMPLETE' | 'ONGOING' | 'DROPPED' | 'INCOMPLETE'>('COMPLETE');
  const [formPoster, setFormPoster] = useState('');

  // Rating form
  const [ratingsForm, setRatingsForm] = useState<FavoritesEntry['ratings']>({ storyline: 5, acting: 5, music: 5, cinematography: 5, ending: 5 });
  const [gapForm, setGapForm] = useState<Record<string, boolean>>({});

  // Ongoing form
  const [ongoingEpisode, setOngoingEpisode] = useState('0');
  const [ongoingTotal, setOngoingTotal] = useState('1');
  const [ongoingDay, setOngoingDay] = useState('Friday');
  const [ongoingCountry, setOngoingCountry] = useState('');

  // Drag & drop
  const [dragYear, setDragYear] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // Touch drag state (Issue 1 fix)
  const cardDragState = useRef<{
    active: boolean;
    dragCard: HTMLElement | null;
    ghost: HTMLElement | null;
    placeholder: HTMLElement | null;
    sourceYear: string | null;
    startX: number;
    startY: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    touchId: number | null;
    sourceIndex: number;
  }>({
    active: false,
    dragCard: null,
    ghost: null,
    placeholder: null,
    sourceYear: null,
    startX: 0,
    startY: 0,
    longPressTimer: null,
    touchId: null,
    sourceIndex: -1,
  });

  // ===== PERSIST =====
  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    localStorage.setItem(DRAWER_STATE_KEY, JSON.stringify(openDrawers));
  }, [openDrawers]);

  // ===== TOAST HELPER =====
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // ===== STATS =====
  const ongoingCount = data.generalList.filter(g => g.status === 'ONGOING').length;
  const favCount = data.generalList.filter(g => g.isFavorite).length;
  const top10Count = Object.values(data.top10Rankings).flat().length;

  // ===== SORTED & FILTERED GENERAL =====
  const filteredGeneral = data.generalList.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !q || item.title.toLowerCase().includes(q) || item.country.toLowerCase().includes(q);
    const matchType = !filterType || item.type === filterType;
    const matchStatus = !filterStatus || item.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortField === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
    else if (sortField === 'year') cmp = parseInt(a.year) - parseInt(b.year);
    else if (sortField === 'country') cmp = a.country.localeCompare(b.country);
    else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ===== ONGOING ITEMS =====
  const ongoingItems = data.generalList
    .filter(g => g.status === 'ONGOING')
    .filter(g => {
      const q = search.toLowerCase();
      const matchSearch = !q || g.title.toLowerCase().includes(q) || g.country.toLowerCase().includes(q);
      const od = data.ongoingData[g.id];
      const matchDay = !filterDay || !od || od.day === filterDay;
      return matchSearch && matchDay;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortField === 'year') cmp = parseInt(a.year) - parseInt(b.year);
      else if (sortField === 'country') cmp = a.country.localeCompare(b.country);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ===== FAVORITES ITEMS =====
  const favItems = data.generalList
    .filter(g => g.isFavorite)
    .filter(g => {
      const q = search.toLowerCase();
      const matchSearch = !q || g.title.toLowerCase().includes(q);
      const matchType = !filterType || g.type === filterType;
      return matchSearch && matchType;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortField === 'year') cmp = parseInt(a.year) - parseInt(b.year);
      else if (sortField === 'country') cmp = a.country.localeCompare(b.country);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // ===== TOP 10 YEARS (Issue 3 fix: only show years with entries) =====
  const top10Years = Object.keys(data.top10Rankings)
    .filter(y => data.top10Rankings[y].length > 0)
    .sort((a, b) => parseInt(b) - parseInt(a));

  // ===== HANDLERS =====
  const openGeneralModal = (editItem?: GeneralEntry) => {
    if (editItem) {
      setFormTitle(editItem.title);
      setFormType(editItem.type);
      setFormYear(editItem.year);
      setFormCountry(editItem.country);
      setFormStatus(editItem.status);
      setFormPoster(editItem.poster);
      setGeneralModal({ open: true, editId: editItem.id });
    } else {
      setFormTitle('');
      setFormType('Series');
      setFormYear(String(new Date().getFullYear()));
      setFormCountry('');
      setFormStatus('COMPLETE');
      setFormPoster('');
      setGeneralModal({ open: true });
    }
  };

  const saveGeneral = () => {
    if (!formTitle.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    const isNew = !generalModal.editId;

    setData(prev => {
      const next = { ...prev, generalList: [...prev.generalList] };

      if (isNew) {
        const newItem: GeneralEntry = {
          id: 'gen_' + Date.now(),
          title: formTitle.trim(),
          type: formType,
          year: formYear,
          country: formCountry.trim(),
          status: formStatus,
          poster: formPoster.trim(),
          isFavorite: false,
          inTop10: false,
        };
        // Auto-create ongoing if status is ONGOING
        if (formStatus === 'ONGOING') {
          next.ongoingData = { ...next.ongoingData, [newItem.id]: { episode: '0', totalEpisodes: '1', day: 'Friday', countryOverride: null } };
        }
        next.generalList = [...next.generalList, newItem];
      } else {
        const idx = next.generalList.findIndex(g => g.id === generalModal.editId);
        if (idx >= 0) {
          const oldStatus = next.generalList[idx].status;
          next.generalList[idx] = {
            ...next.generalList[idx],
            title: formTitle.trim(),
            type: formType,
            year: formYear,
            country: formCountry.trim(),
            status: formStatus,
            poster: formPoster.trim(),
          };

          // Status change side effects
          const newOngoingData = { ...next.ongoingData };
          if (oldStatus !== 'ONGOING' && formStatus === 'ONGOING') {
            newOngoingData[next.generalList[idx].id] = { episode: '0', totalEpisodes: '1', day: 'Friday', countryOverride: null };
          } else if (oldStatus === 'ONGOING' && formStatus !== 'ONGOING') {
            delete newOngoingData[next.generalList[idx].id];
          }
          next.ongoingData = newOngoingData;
        }
      }
      return next;
    });

    setGeneralModal({ open: false });
    showToast(isNew ? 'Entry added!' : 'Entry updated!', 'success');
  };

  const deleteGeneral = (id: string) => {
    if (!confirm('Delete this entry? This will also remove it from Ongoing, Favorites, and Top 10.')) return;
    setData(prev => {
      const next = {
        ...prev,
        generalList: prev.generalList.filter(g => g.id !== id),
        ongoingData: { ...prev.ongoingData },
        favoritesData: { ...prev.favoritesData },
        top10Rankings: { ...prev.top10Rankings },
      };
      // Cascade delete
      delete next.ongoingData[id];
      delete next.favoritesData[id];
      for (const year of Object.keys(next.top10Rankings)) {
        next.top10Rankings[year] = next.top10Rankings[year].filter(gid => gid !== id);
      }
      return next;
    });
    showToast('Entry deleted', 'info');
  };

  const toggleFavorite = (id: string) => {
    setData(prev => {
      const next = { ...prev, generalList: [...prev.generalList] };
      const idx = next.generalList.findIndex(g => g.id === id);
      if (idx >= 0) {
        const wasFav = next.generalList[idx].isFavorite;
        next.generalList[idx] = { ...next.generalList[idx], isFavorite: !wasFav };
        if (!wasFav) {
          // Adding to favorites - create default favoritesData
          if (!next.favoritesData[id]) {
            next.favoritesData = { ...next.favoritesData, [id]: { ratings: { storyline: 5, acting: 5, music: 5, cinematography: 5, ending: 5 }, gapPreferences: {}, overallRating: '5.0' } };
          }
        }
      }
      return next;
    });
    showToast('Favorite toggled', 'success');
  };

  const addToTop10 = (id: string) => {
    const item = data.generalList.find(g => g.id === id);
    if (!item) return;
    setTop10YearSelect(id);
  };

  const confirmAddToTop10 = (year: string) => {
    if (!top10YearSelect) return;
    const id = top10YearSelect;
    const item = data.generalList.find(g => g.id === id);
    if (!item) return;

    setData(prev => {
      const rankings = { ...prev.top10Rankings };
      if (!rankings[year]) rankings[year] = [];
      if (rankings[year].length >= 10) {
        return prev; // Full - shouldn't happen if UI is correct
      }
      if (rankings[year].includes(id)) return prev;

      const next = {
        ...prev,
        generalList: prev.generalList.map(g => g.id === id ? { ...g, inTop10: true } : g),
        top10Rankings: { ...rankings, [year]: [...rankings[year], id] },
      };
      return next;
    });

    setTop10YearSelect(null);
    showToast(`Added to Top 10 ${year}!`, 'success');
  };

  const removeFromTop10 = (year: string, id: string) => {
    setData(prev => {
      const next = {
        ...prev,
        generalList: prev.generalList.map(g => g.id === id ? { ...g, inTop10: false } : g),
        top10Rankings: {
          ...prev.top10Rankings,
          [year]: prev.top10Rankings[year].filter(gid => gid !== id),
        },
      };
      // Remove empty year drawers (Issue 3 fix)
      if (next.top10Rankings[year].length === 0) {
        const updated = { ...next.top10Rankings };
        delete updated[year];
        next.top10Rankings = updated;
      }
      return next;
    });
    showToast('Removed from Top 10', 'info');
  };

  const openOngoingModal = (generalId: string) => {
    const od = data.ongoingData[generalId];
    const item = data.generalList.find(g => g.id === generalId);
    if (od && item) {
      setOngoingEpisode(od.episode);
      setOngoingTotal(od.totalEpisodes);
      setOngoingDay(od.day);
      setOngoingCountry(od.countryOverride || item.country);
      setOngoingModal({ open: true, generalId });
    }
  };

  const saveOngoing = () => {
    if (!ongoingModal) return;
    setData(prev => ({
      ...prev,
      ongoingData: {
        ...prev.ongoingData,
        [ongoingModal.generalId]: {
          episode: ongoingEpisode,
          totalEpisodes: ongoingTotal,
          day: ongoingDay,
          countryOverride: ongoingCountry !== data.generalList.find(g => g.id === ongoingModal.generalId)?.country ? ongoingCountry : null,
        },
      },
    }));
    setOngoingModal(null);
    showToast('Ongoing entry updated!', 'success');
  };

  const openFavModal = (generalId: string) => {
    const fd = data.favoritesData[generalId];
    if (fd) {
      setRatingsForm({ ...fd.ratings });
      setGapForm({ ...fd.gapPreferences });
    } else {
      setRatingsForm({ storyline: 5, acting: 5, music: 5, cinematography: 5, ending: 5 });
      setGapForm({});
    }
    setFavModal({ open: true, generalId });
  };

  const saveFavorites = () => {
    if (!favModal) return;
    const overall = computeOverallRating(ratingsForm, gapForm);
    setData(prev => ({
      ...prev,
      favoritesData: {
        ...prev.favoritesData,
        [favModal.generalId]: {
          ratings: { ...ratingsForm },
          gapPreferences: { ...gapForm },
          overallRating: overall,
        },
      },
    }));
    setFavModal(null);
    showToast('Ratings saved!', 'success');
  };

  const removeFavorite = (id: string) => {
    setData(prev => {
      const next = { ...prev, generalList: [...prev.generalList] };
      const idx = next.generalList.findIndex(g => g.id === id);
      if (idx >= 0) {
        next.generalList[idx] = { ...next.generalList[idx], isFavorite: false };
      }
      return next;
    });
    showToast('Removed from favorites', 'info');
  };

  // ===== DRAG & DROP - TOP 10 =====
  const handleCardDragStart = (e: React.DragEvent, year: string, index: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ year, index }));
    setDragYear(year);
    setDragIdx(index);
  };

  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIdx(index);
  };

  const handleCardDrop = (e: React.DragEvent, year: string, targetIndex: number) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain');
    if (!payload) return;
    try {
      const { year: srcYear, index: srcIndex } = JSON.parse(payload);
      if (srcYear !== year) return;
      reorderTop10(year, srcIndex, targetIndex);
    } catch { /* ignore */ }
    setDragYear(null);
    setDragIdx(null);
    setDropIdx(null);
  };

  const handleCardDragEnd = () => {
    setDragYear(null);
    setDragIdx(null);
    setDropIdx(null);
  };

  const reorderTop10 = (year: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setData(prev => {
      const arr = [...prev.top10Rankings[year]];
      const [removed] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, removed);
      return { ...prev, top10Rankings: { ...prev.top10Rankings, [year]: arr } };
    });
  };

  // ===== TOUCH DRAG (Issue 1 fix with proper cleanup) =====
  const handleTouchStart = (e: React.TouchEvent, year: string, index: number) => {
    const touch = e.touches[0];
    const state = cardDragState.current;
    state.startX = touch.clientX;
    state.startY = touch.clientY;
    state.sourceYear = year;
    state.sourceIndex = index;
    state.touchId = touch.identifier;

    state.longPressTimer = setTimeout(() => {
      const card = document.querySelector(`[data-card-year="${year}"][data-card-index="${index}"]`) as HTMLElement;
      if (!card) return;
      state.active = true;
      state.dragCard = card;
      card.classList.add('dragging');

      // Create ghost
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.classList.add('card-ghost');
      ghost.style.width = card.offsetWidth + 'px';
      ghost.style.position = 'fixed';
      ghost.style.left = touch.clientX - card.offsetWidth / 2 + 'px';
      ghost.style.top = touch.clientY - card.offsetHeight / 2 + 'px';
      document.body.appendChild(ghost);
      state.ghost = ghost;

      // Create placeholder
      const placeholder = document.createElement('div');
      placeholder.classList.add('card-placeholder');
      placeholder.style.width = card.offsetWidth + 'px';
      placeholder.style.height = card.offsetHeight + 'px';
      card.parentNode?.insertBefore(placeholder, card.nextSibling);
      state.placeholder = placeholder;

      if (navigator.vibrate) navigator.vibrate(50);
      document.body.style.overflow = 'hidden';
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const state = cardDragState.current;
    const touch = Array.from(e.touches).find(t => t.identifier === state.touchId);
    if (!touch) return;

    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    if (!state.active) {
      // Cancel if moved too much before long press
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
      }
      return;
    }

    e.preventDefault();
    if (state.ghost) {
      state.ghost.style.left = touch.clientX - state.ghost.offsetWidth / 2 + 'px';
      state.ghost.style.top = touch.clientY - state.ghost.offsetHeight / 2 + 'px';
    }

    // Find drop target
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = elem?.closest('.poster-card') as HTMLElement;
    if (card && state.placeholder) {
      const parent = card.parentNode;
      if (parent) {
        parent.insertBefore(state.placeholder, card.nextSibling);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const state = cardDragState.current;

    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    if (!state.active) return;

    const touch = Array.from(e.changedTouches).find(t => t.identifier === state.touchId);
    if (!touch) return;

    // Find final drop position
    if (state.placeholder && state.sourceYear !== null) {
      const container = state.placeholder.parentNode as HTMLElement;
      if (container) {
        const cards = Array.from(container.querySelectorAll('.poster-card, .card-placeholder'));
        const siblings = Array.from(container.querySelectorAll('.poster-card'));
        let targetIdx = 0;
        for (let i = 0; i < cards.length; i++) {
          if (cards[i] === state.placeholder) {
            targetIdx = Math.min(i, siblings.length - 1);
            break;
          }
        }
        if (state.sourceIndex !== targetIdx) {
          reorderTop10(state.sourceYear, state.sourceIndex, targetIdx);
        }
      }
    }

    // Cleanup (Issue 1 fix)
    cleanupTouchDrag();
  };

  // Issue 1: Proper cleanup function
  const cleanupTouchDrag = () => {
    const state = cardDragState.current;
    if (state.ghost) {
      state.ghost.remove();
      state.ghost = null;
    }
    if (state.placeholder) {
      state.placeholder.remove();
      state.placeholder = null;
    }
    if (state.dragCard) {
      state.dragCard.classList.remove('dragging');
      state.dragCard = null;
    }
    document.querySelectorAll('.poster-card.dragging').forEach(c => c.classList.remove('dragging'));
    state.active = false;
    state.sourceYear = null;
    state.touchId = null;
    document.body.style.overflow = '';
  };

  // Issue 1: Global touchcancel handler
  useEffect(() => {
    const handleTouchCancel = () => {
      const state = cardDragState.current;
      if (state.ghost) state.ghost.remove();
      if (state.placeholder) state.placeholder.remove();
      document.querySelectorAll('.poster-card.dragging').forEach(c => c.classList.remove('dragging'));
      state.active = false;
      state.dragCard = null;
      state.ghost = null;
      state.placeholder = null;
      state.sourceYear = null;
      state.touchId = null;
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
      document.body.style.overflow = '';
    };

    document.addEventListener('touchcancel', handleTouchCancel);
    return () => document.removeEventListener('touchcancel', handleTouchCancel);
  }, []);

  // Issue 1: Failsafe - tap to remove stuck ghost
  useEffect(() => {
    const handleClick = () => {
      document.querySelectorAll('.card-ghost').forEach(g => g.remove());
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // ===== ADD YEAR DRAWER (Issue 3 fix: manual only) =====
  const addNewYearDrawer = () => {
    const year = prompt('Enter year for new drawer (e.g., 2027):');
    if (year && year.trim()) {
      const y = year.trim();
      if (!data.top10Rankings[y]) {
        setData(prev => ({
          ...prev,
          top10Rankings: { ...prev.top10Rankings, [y]: [] },
        }));
        setOpenDrawers(prev => ({ ...prev, [y]: true }));
        showToast(`Drawer for ${y} created!`, 'success');
      } else {
        showToast(`Drawer for ${y} already exists`, 'error');
      }
    }
  };

  // ===== OPEN TOP 10 PICKER =====
  const openTop10Picker = (year: string) => {
    setTop10Picker({ open: true, year });
  };

  // ===== SHARE / EXPORT / IMPORT =====
  const generateShareCode = (): string => {
    const payload = JSON.stringify(data);
    return btoa(encodeURIComponent(payload));
  };

  const importFromCode = (code: string) => {
    try {
      const payload = decodeURIComponent(atob(code));
      const imported = JSON.parse(payload) as AppData;
      // Validate
      if (imported.generalList && imported.top10Rankings) {
        // Clean empty year drawers (Issue 3 fix)
        const cleanedRankings: Record<string, string[]> = {};
        for (const [year, ids] of Object.entries(imported.top10Rankings)) {
          if (ids.length > 0) cleanedRankings[year] = ids;
        }
        imported.top10Rankings = cleanedRankings;
        setData(imported);
        showToast('Data imported successfully!', 'success');
        return true;
      }
      throw new Error('Invalid data');
    } catch {
      showToast('Invalid import code', 'error');
      return false;
    }
  };

  const exportJSON = (): string => {
    return JSON.stringify(data, null, 2);
  };

  const importJSON = (json: string) => {
    try {
      const imported = JSON.parse(json) as AppData;
      // Clean empty year drawers (Issue 3 fix)
      const cleanedRankings: Record<string, string[]> = {};
      for (const [year, ids] of Object.entries(imported.top10Rankings)) {
        if (ids.length > 0) cleanedRankings[year] = ids;
      }
      imported.top10Rankings = cleanedRankings;
      setData(imported);
      showToast('Data imported!', 'success');
      return true;
    } catch {
      showToast('Invalid JSON', 'error');
      return false;
    }
  };

  // ===== SORT TOGGLE =====
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ===== RENDER =====
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="header">
        <div className="header-title">BL Watchlist Manager</div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShareModal(true)}>
            <span>Share</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setImportModal(true)}>
            <span>Import</span>
          </button>
        </div>
      </header>

      {/* Tabs - WITH MOBILE FIX: horizontal scroll */}
      <div className="tabs-container">
        <div className="tabs">
          <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
            General <span className="badge">{data.generalList.length}</span>
          </button>
          <button className={`tab ${activeTab === 'ongoing' ? 'active' : ''}`} onClick={() => setActiveTab('ongoing')}>
            Ongoing <span className="badge">{ongoingCount}</span>
          </button>
          <button className={`tab ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
            Favorites <span className="badge">{favCount}</span>
          </button>
          <button className={`tab ${activeTab === 'top10' ? 'active' : ''}`} onClick={() => setActiveTab('top10')}>
            Top 10 <span className="badge">{top10Count}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="main-content">
        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-item"><strong>{data.generalList.length}</strong> Total</div>
          <div className="stat-item"><strong>{ongoingCount}</strong> Ongoing</div>
          <div className="stat-item"><strong>{favCount}</strong> Favorites</div>
          <div className="stat-item"><strong>{top10Count}</strong> In Top 10</div>
        </div>

        {/* ===== GENERAL TAB ===== */}
        {activeTab === 'general' && (
          <div>
            <div className="toolbar">
              <input
                type="text"
                placeholder="Search title or country..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="Series">Series</option>
                <option value="Movie">Movie</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="COMPLETE">Complete</option>
                <option value="ONGOING">Ongoing</option>
                <option value="DROPPED">Dropped</option>
                <option value="INCOMPLETE">Incomplete</option>
              </select>
              <button className="btn btn-primary" onClick={() => openGeneralModal()}>+ Add Entry</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Poster</th>
                    <th onClick={() => toggleSort('title')}>Title {sortField === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th onClick={() => toggleSort('type')}>Type {sortField === 'type' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th onClick={() => toggleSort('year')}>Year {sortField === 'year' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th onClick={() => toggleSort('country')}>Country {sortField === 'country' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th onClick={() => toggleSort('status')}>Status {sortField === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGeneral.map(item => (
                    <tr key={item.id}>
                      <td><img src={item.poster || 'https://via.placeholder.com/40x56?text=No+Poster'} alt="" className="poster-thumb" onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40x56?text=No+Poster'; }} /></td>
                      <td style={{ fontWeight: 500 }}>{item.title}</td>
                      <td><span className={`badge-type badge-${item.type.toLowerCase()}`}>{item.type}</span></td>
                      <td>{item.year}</td>
                      <td>{item.country}</td>
                      <td><span className={`badge-status status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn-icon" title={item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'} onClick={() => toggleFavorite(item.id)}>
                            {item.isFavorite ? '❤️' : '🤍'}
                          </button>
                          <button className="btn-icon" title={item.inTop10 ? 'In Top 10' : 'Add to Top 10'} onClick={() => item.inTop10 ? showToast('Already in Top 10. Remove from Top 10 tab.', 'info') : addToTop10(item.id)}>
                            {item.inTop10 ? '⭐' : '☆'}
                          </button>
                          <button className="btn-icon" title="Edit" onClick={() => openGeneralModal(item)}>✏️</button>
                          <button className="btn-icon" title="Delete" onClick={() => deleteGeneral(item.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredGeneral.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No entries found</div>
            )}
          </div>
        )}

        {/* ===== ONGOING TAB ===== */}
        {activeTab === 'ongoing' && (
          <div>
            <div className="auto-sync-info">Entries auto-synced from General List (Status: ONGOING)</div>
            <div className="toolbar">
              <input type="text" placeholder="Search title or country..." value={search} onChange={e => setSearch(e.target.value)} />
              <select value={filterDay} onChange={e => setFilterDay(e.target.value)}>
                <option value="">All Days</option>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Poster</th>
                    <th onClick={() => toggleSort('title')}>Title {sortField === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th>Type</th>
                    <th>Year</th>
                    <th>Country</th>
                    <th>Episode</th>
                    <th>Day</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ongoingItems.map(item => {
                    const od = data.ongoingData[item.id];
                    const ep = parseInt(od?.episode || '0');
                    const total = parseInt(od?.totalEpisodes || '1');
                    const pct = total > 0 ? (ep / total) * 100 : 0;
                    return (
                      <tr key={item.id}>
                        <td><img src={item.poster || 'https://via.placeholder.com/40x56?text=No+Poster'} alt="" className="poster-thumb" onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40x56?text=No+Poster'; }} /></td>
                        <td style={{ fontWeight: 500 }}>{item.title}</td>
                        <td><span className={`badge-type badge-${item.type.toLowerCase()}`}>{item.type}</span></td>
                        <td>{item.year}</td>
                        <td>{od?.countryOverride || item.country}</td>
                        <td>
                          <div className="episode-inputs">{od?.episode || '0'} / {od?.totalEpisodes || '1'}</div>
                          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
                        </td>
                        <td>{od?.day || 'Friday'}</td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn-icon" title="Edit" onClick={() => openOngoingModal(item.id)}>✏️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {ongoingItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No ongoing entries. Mark entries as ONGOING in the General List.</div>
            )}
          </div>
        )}

        {/* ===== FAVORITES TAB ===== */}
        {activeTab === 'favorites' && (
          <div>
            <div className="auto-sync-info">Mark entries as Favorite in the General List</div>
            <div className="toolbar">
              <input type="text" placeholder="Search title..." value={search} onChange={e => setSearch(e.target.value)} />
              <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="Series">Series</option>
                <option value="Movie">Movie</option>
              </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Poster</th>
                    <th onClick={() => toggleSort('title')}>Title {sortField === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
                    <th>Type</th>
                    <th>Year</th>
                    <th>Country</th>
                    <th>Rating</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {favItems.map(item => {
                    const fd = data.favoritesData[item.id];
                    return (
                      <tr key={item.id}>
                        <td><img src={item.poster || 'https://via.placeholder.com/40x56?text=No+Poster'} alt="" className="poster-thumb" onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40x56?text=No+Poster'; }} /></td>
                        <td style={{ fontWeight: 500 }}>{item.title}</td>
                        <td><span className={`badge-type badge-${item.type.toLowerCase()}`}>{item.type}</span></td>
                        <td>{item.year}</td>
                        <td>{item.country}</td>
                        <td>{fd?.overallRating || '-'}</td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn-icon" title="View Ratings" onClick={() => setDetailModal(item.id)}>👁️</button>
                            <button className="btn-icon" title="Edit Ratings" onClick={() => openFavModal(item.id)}>✏️</button>
                            <button className="btn-icon" title="Remove from Favorites" onClick={() => removeFavorite(item.id)}>❌</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {favItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>No favorites yet. Mark entries as Favorite in the General List.</div>
            )}
          </div>
        )}

        {/* ===== TOP 10 TAB ===== */}
        {activeTab === 'top10' && (
          <div>
            <div className="toolbar">
              <input type="text" placeholder="Search title..." value={search} onChange={e => setSearch(e.target.value)} />
              <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="Series">Series</option>
                <option value="Movie">Movie</option>
              </select>
              <button className="btn btn-primary" onClick={addNewYearDrawer}>+ Add New Year Drawer</button>
            </div>

            {top10Years.map(year => {
              const rankings = data.top10Rankings[year] || [];
              const filteredRankings = rankings.filter(id => {
                const item = data.generalList.find(g => g.id === id);
                if (!item) return false;
                const q = search.toLowerCase();
                const matchSearch = !q || item.title.toLowerCase().includes(q);
                const matchType = !filterType || item.type === filterType;
                return matchSearch && matchType;
              });
              const isOpen = !!openDrawers[year];

              return (
                <div key={year} className="year-drawer">
                  <div className="drawer-header" onClick={() => setOpenDrawers(prev => ({ ...prev, [year]: !prev[year] }))}>
                    <div className="drawer-header-left">
                      <span className={`drawer-toggle ${isOpen ? 'open' : ''}`}>▶</span>
                      <span className="drawer-year">{year}</span>
                      <span className="drawer-count">{rankings.length}/10</span>
                    </div>
                    <div className="drawer-actions">
                      <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); openTop10Picker(year); }}>+ Add</button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="drawer-content">
                      <div className="poster-grid">
                        {filteredRankings.map((generalId, idx) => {
                          const item = data.generalList.find(g => g.id === generalId);
                          if (!item) return null;
                          return (
                            <div
                              key={generalId}
                              className={`poster-card ${dragYear === year && dragIdx === idx ? 'dragging' : ''} ${dropIdx === idx && dragYear === year ? 'drag-over' : ''}`}
                              draggable
                              data-card-year={year}
                              data-card-index={idx}
                              onDragStart={e => handleCardDragStart(e, year, idx)}
                              onDragOver={e => handleCardDragOver(e, idx)}
                              onDrop={e => handleCardDrop(e, year, idx)}
                              onDragEnd={handleCardDragEnd}
                              onTouchStart={e => handleTouchStart(e, year, idx)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
                            >
                              <div className="rank-badge">#{idx + 1}</div>
                              <img src={item.poster || 'https://via.placeholder.com/140x210?text=No+Poster'} alt={item.title} className="poster-card-img" onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/140x210?text=No+Poster'; }} />
                              <div style={{ marginTop: 6, fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                <span className={`badge-type badge-${item.type.toLowerCase()}`}>{item.type}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>{item.country}</span>
                              </div>
                              <button
                                className="btn-icon"
                                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 24, height: 24, color: 'white', fontSize: '0.7rem' }}
                                onClick={() => removeFromTop10(year, generalId)}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                        {/* Empty slots */}
                        {Array.from({ length: Math.max(0, 10 - rankings.length) }).map((_, i) => (
                          <div key={`empty-${i}`} className="empty-slot">
                            <span className="slot-number">Slot #{rankings.length + i + 1}</span>
                            <span>Empty</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {top10Years.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
                No Top 10 entries yet. Use "Add New Year Drawer" to create a year, then add entries.
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== MODALS ===== */}

      {/* General Add/Edit Modal */}
      {generalModal.open && (
        <div className="modal-overlay" onClick={() => setGeneralModal({ open: false })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{generalModal.editId ? 'Edit Entry' : 'Add New Entry'}</h3>
              <button className="modal-close" onClick={() => setGeneralModal({ open: false })}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label>Title *</label><input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Enter title" /></div>
              <div className="form-group"><label>Type</label><select value={formType} onChange={e => setFormType(e.target.value as 'Series' | 'Movie')}><option value="Series">Series</option><option value="Movie">Movie</option></select></div>
              <div className="form-group"><label>Year</label><input value={formYear} onChange={e => setFormYear(e.target.value)} placeholder="2025" /></div>
              <div className="form-group"><label>Country</label><input value={formCountry} onChange={e => setFormCountry(e.target.value)} placeholder="Thailand" /></div>
              <div className="form-group"><label>Status</label><select value={formStatus} onChange={e => setFormStatus(e.target.value as any)}><option value="COMPLETE">COMPLETE</option><option value="ONGOING">ONGOING</option><option value="DROPPED">DROPPED</option><option value="INCOMPLETE">INCOMPLETE</option></select></div>
              <div className="form-group"><label>Poster URL</label><input value={formPoster} onChange={e => setFormPoster(e.target.value)} placeholder="https://..." /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setGeneralModal({ open: false })}>Cancel</button>
              <button className="btn btn-primary" onClick={saveGeneral}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Ongoing Edit Modal */}
      {ongoingModal?.open && (
        <div className="modal-overlay" onClick={() => setOngoingModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Ongoing Entry</h3>
              <button className="modal-close" onClick={() => setOngoingModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const item = data.generalList.find(g => g.id === ongoingModal.generalId);
                return item ? (
                  <div style={{ marginBottom: 16, padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{item.type} • {item.year} • {item.country}</div>
                    {item.poster && <img src={item.poster} alt="" style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6, marginTop: 8, border: '1px solid var(--border)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                  </div>
                ) : null;
              })()}
              <div className="form-group"><label>Episode</label><input type="number" value={ongoingEpisode} onChange={e => setOngoingEpisode(e.target.value)} min="0" /></div>
              <div className="form-group"><label>Total Episodes</label><input type="number" value={ongoingTotal} onChange={e => setOngoingTotal(e.target.value)} min="1" /></div>
              <div className="form-group"><label>Day</label><select value={ongoingDay} onChange={e => setOngoingDay(e.target.value)}>{DAYS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
              <div className="form-group">
                <label>Country</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={ongoingCountry} onChange={e => setOngoingCountry(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    const item = data.generalList.find(g => g.id === ongoingModal.generalId);
                    if (item) setOngoingCountry(item.country);
                  }}>↻ Reset</button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOngoingModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveOngoing}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Favorites Rating Modal */}
      {favModal?.open && (
        <div className="modal-overlay" onClick={() => setFavModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rate Entry</h3>
              <button className="modal-close" onClick={() => setFavModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="overall-rating">
                <div className="overall-rating-value">{computeOverallRating(ratingsForm, gapForm)}</div>
                <div className="overall-rating-label">Overall Rating</div>
              </div>
              {(['storyline', 'acting', 'music', 'cinematography', 'ending'] as const).map(cat => (
                <div className="rating-row" key={cat}>
                  <label style={{ textTransform: 'capitalize' }}>{cat}</label>
                  <input type="range" min="0" max="10" step="1" value={ratingsForm[cat]} onChange={e => setRatingsForm(prev => ({ ...prev, [cat]: parseInt(e.target.value) }))} />
                  <span>{ratingsForm[cat]}</span>
                </div>
              ))}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text2)', marginBottom: 8, display: 'block' }}>Gap Preferences (checked = strong in this area)</label>
                <div className="gap-grid">
                  {GAP_OPTIONS.map(gap => (
                    <div key={gap} className={`gap-item ${gapForm[gap] ? 'checked' : ''}`} onClick={() => setGapForm(prev => ({ ...prev, [gap]: !prev[gap] }))}>
                      <input type="checkbox" checked={!!gapForm[gap]} onChange={() => {}} />
                      <span>{gap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setFavModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveFavorites}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rating Details</h3>
              <button className="modal-close" onClick={() => setDetailModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {(() => {
                const item = data.generalList.find(g => g.id === detailModal);
                const fd = data.favoritesData[detailModal];
                if (!item || !fd) return <div>No data</div>;
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                      <img src={item.poster || 'https://via.placeholder.com/100x150?text=No+Poster'} alt="" style={{ width: 100, height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/100x150?text=No+Poster'; }} />
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.title}</div>
                        <div style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 4 }}>{item.type} • {item.year} • {item.country}</div>
                        <div className="overall-rating" style={{ marginTop: 12, marginBottom: 0 }}>
                          <div className="overall-rating-value">{fd.overallRating}</div>
                          <div className="overall-rating-label">Overall</div>
                        </div>
                      </div>
                    </div>
                    <h4 style={{ marginBottom: 12, fontSize: '0.9rem' }}>Category Ratings</h4>
                    {Object.entries(fd.ratings).map(([cat, val]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', textTransform: 'capitalize' }}>
                        <span>{cat}</span>
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{val}/10</span>
                      </div>
                    ))}
                    <h4 style={{ margin: '20px 0 12px', fontSize: '0.9rem' }}>Gap Preferences</h4>
                    <div className="gap-grid">
                      {GAP_OPTIONS.map(gap => (
                        <div key={gap} className={`gap-item ${fd.gapPreferences[gap] ? 'checked' : ''}`} style={{ cursor: 'default' }}>
                          <input type="checkbox" checked={!!fd.gapPreferences[gap]} readOnly />
                          <span>{gap}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Top 10 Year Select Modal */}
      {top10YearSelect && (
        <div className="modal-overlay" onClick={() => setTop10YearSelect(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Year for Top 10</h3>
              <button className="modal-close" onClick={() => setTop10YearSelect(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="year-selector">
                {(() => {
                  const item = data.generalList.find(g => g.id === top10YearSelect);
                  if (!item) return null;
                  const existingYears = Object.keys(data.top10Rankings).filter(y => {
                    const arr = data.top10Rankings[y];
                    return arr.length < 10 && !arr.includes(top10YearSelect) && y === item.year;
                  });
                  if (existingYears.length === 0) {
                    // Show the entry's year as an option
                    const y = item.year;
                    const currentCount = data.top10Rankings[y]?.length || 0;
                    if (currentCount >= 10) {
                      return <div style={{ color: 'var(--text3)', padding: 20, textAlign: 'center' }}>Top 10 for {y} is full. Remove an entry first.</div>;
                    }
                    return (
                      <button key={y} className="year-chip" onClick={() => confirmAddToTop10(y)}>
                        {y} ({currentCount}/10)
                      </button>
                    );
                  }
                  return existingYears.map(y => (
                    <button key={y} className="year-chip" onClick={() => confirmAddToTop10(y)}>
                      {y} ({data.top10Rankings[y].length}/10)
                    </button>
                  ));
                })()}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTop10YearSelect(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Top 10 Picker Modal */}
      {top10Picker.open && (
        <Top10PickerModal
          year={top10Picker.year}
          data={data}
          onClose={() => setTop10Picker({ open: false, year: '' })}
          onAdd={(year, ids) => {
            setData(prev => {
              const rankings = prev.top10Rankings[year] ? [...prev.top10Rankings[year]] : [];
              const nextGeneral = [...prev.generalList];
              for (const id of ids) {
                if (!rankings.includes(id) && rankings.length < 10) {
                  rankings.push(id);
                  const idx = nextGeneral.findIndex(g => g.id === id);
                  if (idx >= 0) nextGeneral[idx] = { ...nextGeneral[idx], inTop10: true };
                }
              }
              return {
                ...prev,
                generalList: nextGeneral,
                top10Rankings: { ...prev.top10Rankings, [year]: rankings },
              };
            });
            showToast(`Added to Top 10 ${year}!`, 'success');
            setTop10Picker({ open: false, year: '' });
          }}
        />
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Share / Export</h3>
              <button className="modal-close" onClick={() => setShareModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Share Code (copy this)</label>
                <textarea className="share-textarea" readOnly value={generateShareCode()} onClick={e => { (e.target as HTMLTextAreaElement).select(); navigator.clipboard.writeText(generateShareCode()); showToast('Share code copied!', 'success'); }} />
              </div>
              <div className="form-group">
                <label>JSON Export</label>
                <textarea className="share-textarea" readOnly value={exportJSON()} onClick={e => { (e.target as HTMLTextAreaElement).select(); navigator.clipboard.writeText(exportJSON()); showToast('JSON copied!', 'success'); }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShareModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <div className="modal-overlay" onClick={() => setImportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Import Data</h3>
              <button className="modal-close" onClick={() => setImportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Paste Share Code or JSON</label>
                <textarea className="share-textarea" value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste share code or JSON here..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setImportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const trimmed = importText.trim();
                if (!trimmed) return;
                // Try share code first, then JSON
                let success = false;
                if (!trimmed.startsWith('{')) {
                  success = importFromCode(trimmed);
                }
                if (!success) {
                  success = importJSON(trimmed);
                }
                if (success) {
                  setImportModal(false);
                  setImportText('');
                }
              }}>Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}

// ===== TOP 10 PICKER MODAL COMPONENT =====
function Top10PickerModal({ year, data, onClose, onAdd }: {
  year: string;
  data: AppData;
  onClose: () => void;
  onAdd: (year: string, ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const currentCount = data.top10Rankings[year]?.length || 0;
  const availableSlots = 10 - currentCount;

  const availableItems = data.generalList.filter(g => {
    if (g.year !== year) return false;
    const inThisYear = data.top10Rankings[year]?.includes(g.id);
    return !inThisYear;
  });

  const filteredItems = availableItems;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>Add to Top 10 — {year} ({currentCount}/10)</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {availableSlots === 0 && (
            <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>Top 10 for {year} is full. Remove an entry first.</div>
          )}
          {availableSlots > 0 && filteredItems.length === 0 && (
            <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>No available entries from {year} in General List.</div>
          )}
          {availableSlots > 0 && filteredItems.map(item => (
            <div
              key={item.id}
              className={`general-picker-item ${picked.has(item.id) ? 'selected' : ''}`}
              onClick={() => {
                setPicked(prev => {
                  const next = new Set(prev);
                  if (next.has(item.id)) {
                    next.delete(item.id);
                  } else if (next.size < availableSlots) {
                    next.add(item.id);
                  }
                  return next;
                });
              }}
            >
              <img src={item.poster || 'https://via.placeholder.com/40x56?text=No+Poster'} alt="" onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40x56?text=No+Poster'; }} />
              <div className="picker-info">
                <div className="picker-title">{item.title}</div>
                <div className="picker-meta">{item.type} • {item.country}</div>
              </div>
              <input type="checkbox" checked={picked.has(item.id)} onChange={() => { }} />
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <span style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>{picked.size} selected / {availableSlots} slots</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onAdd(year, Array.from(picked))} disabled={picked.size === 0}>Add Selected</button>
          </div>
        </div>
      </div>
    </div>
  );
}
