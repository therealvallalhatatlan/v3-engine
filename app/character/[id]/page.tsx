'use client';

import LoadingScreen from '../../components/LoadingScreen';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ImageInfo } from './AnimationPanel';
import type { Character } from '../../../types';
import type { AspectRatio16x9, LocationPreset } from '../../../types/prompt';
import { LIGHTING_PRESETS } from '../../../lib/lighting';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';

type PresetOption = { value: string; label: string };

const DEFAULT_CAMERA_OPTIONS: PresetOption[] = [
  { value: 'closeup', label: 'Közeli · Close-up' },
  { value: 'extreme-closeup', label: 'Extrém közeli · Extreme Close-up' },
  { value: 'medium', label: 'Közép · Medium Shot' },
  { value: 'medium-wide', label: 'Közép-tág · Medium Wide' },
  { value: 'wide', label: 'Tág · Wide Shot' },
  { value: 'extreme-wide', label: 'Nagyon tág · Extreme Wide' },
  { value: 'ultrawide-14mm', label: 'Objektív · 14mm Ultra Wide' },
  { value: 'wide-24mm', label: 'Objektív · 24mm Wide' },
  { value: 'environmental-35mm', label: 'Objektív · 35mm Environmental' },
  { value: 'normal-50mm', label: 'Objektív · 50mm Natural' },
  { value: 'portrait-85mm', label: 'Objektív · 85mm Portrait' },
  { value: 'telephoto-135mm', label: 'Objektív · 135mm Telephoto' },
  { value: 'compressed-telephoto', label: 'Objektív · Erősen komprimált tele' },
  { value: 'macro', label: 'Objektív · Macro' },
  { value: 'fisheye', label: 'Optika · Fisheye' },
  { value: 'tilt-shift', label: 'Optika · Tilt-shift' },
  { value: 'low-angle', label: 'Nézőpont · Alulról' },
  { value: 'ground-level', label: 'Nézőpont · Talajszint' },
  { value: 'wormseye', label: 'Nézőpont · Extrém alulnézet' },
  { value: 'high-angle', label: 'Nézőpont · Felülről' },
  { value: 'overhead', label: 'Nézőpont · Merőleges overhead' },
  { value: 'ceiling-corner', label: 'Nézőpont · Mennyezeti sarok' },
  { value: 'dutch-angle', label: 'Nézőpont · Dutch angle' },
  { value: 'profile', label: 'Nézőpont · Tiszta profil' },
  { value: 'three-quarter-profile', label: 'Nézőpont · Háromnegyed profil' },
  { value: 'over-shoulder', label: 'Filmes · Over-the-Shoulder' },
  { value: 'subjective-pov', label: 'Filmes · Szubjektív POV' },
  { value: 'rear-three-quarter', label: 'Filmes · Hátulról 3/4' },
  { value: 'foreground-obstructed', label: 'Filmes · Előtérrel kitakart' },
  { value: 'doorway-peek', label: 'Filmes · Ajtófélfán túlról' },
  { value: 'through-glass', label: 'Filmes · Üvegen keresztül' },
  { value: 'reflection', label: 'Filmes · Tükör / tükröződés' },
  { value: 'dashboard-pov', label: 'Filmes · Műszerfal POV' },
  { value: 'corner-wide', label: 'Kompozíció · Sarokból tág' },
  { value: 'centered-symmetry', label: 'Kompozíció · Középtengely' },
  { value: 'off-axis', label: 'Kompozíció · Tengelyen kívül' },
  { value: 'long-corridor', label: 'Kompozíció · Hosszú perspektíva' },
  { value: 'surrounding-subject', label: 'Kompozíció · Körbezáró tér' },
];

const DEFAULT_STYLE_OPTIONS: PresetOption[] = [
  { value: 'gritty', label: 'Gritty Underground (Default)' },
  { value: 'noir-bw', label: 'Black and White Film Noir' },
  { value: 'vhs-glitch', label: 'Glitch VHS Analog Camera' },
  { value: 'neo-noir-neon', label: 'Neo Noir Neon' },
  { value: 'dreamy-ethereal', label: 'Dreamy Ethereal' },
  { value: 'graphic-novel', label: 'Graphic Novel' },
  { value: 'police-speed-photo', label: 'Police Speeding Camera Photo' },
];

const DEFAULT_LOCATION_OPTIONS: PresetOption[] = [
  { value: '', label: 'Üres preset' },
  { value: 'urban-street', label: 'Urban Street' },
  { value: 'apartment', label: 'Apartment Interior' },
  { value: 'office', label: 'Office' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'rooftop', label: 'Rooftop' },
  { value: 'subway', label: 'Subway Station' },
  { value: 'forest', label: 'Forest' },
  { value: 'industrial-yard', label: 'Industrial Yard' },
  { value: 'night-highway', label: 'Night Highway' },
  { value: 'interrogation-room', label: 'Interrogation Room' },
  { value: 'budai', label: 'Budai Family Room (Old-World Interior)' },
  { value: 'bevasarlokozpont', label: 'Budapest Mall Clothing Store (1999)' },
  { value: 'vaulted-cellar-server-room', label: 'Vaulted Brick Cellar / Retro Server Room' },
  { value: 'mcdonalds-east-eu-2000', label: 'McDonalds East Europe (Late 90s / 2000)' },
  { value: 'land-rover-interior-pov', label: 'Old Land Rover Interior (POV)' },
  { value: 'white-studio-sofa', label: 'White Studio / Large Sofa' },
  { value: 'hotel-courtyard-pool-cocktail-bar', label: 'Szálloda belső udvara úszómedencével és koktélbárral' },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio16x9; label: string }> = [
  { value: 'landscape-16-9', label: 'Fekvő 16:9' },
  { value: 'portrait-9-16', label: 'Álló 9:16' },
];

const LOCATION_HISTORY_KEY = 'illustration.location.history';
const LIGHTING_HISTORY_KEY = 'illustration.lighting.history';
const GENERATE_FORM_VERSION = 'v1';
const CHAR_FORM_KEY_PREFIX = `illustration.generate.form.${GENERATE_FORM_VERSION}.character`;
const CHAR_PRESETS_KEY_PREFIX = `illustration.generate.presets.${GENERATE_FORM_VERSION}.character`;
const GLOBAL_PRESETS_KEY = `illustration.generate.presets.${GENERATE_FORM_VERSION}.global`;
const GLOBAL_DEFAULT_PRESET_KEY = `illustration.generate.defaultPreset.${GENERATE_FORM_VERSION}.global`;

 type GenerateFormState = {
  location: string;
  lighting: string;
  locationPreset: string;
  locationGeometry: string;
  locationPalette: string;
  locationProps: string;
  locationCameraContinuity: string;
  lockGeometry: boolean;
  lockLighting: boolean;
  lockPalette: boolean;
  lockProps: boolean;
  lockCameraRules: boolean;
  continuityNotes: string;
  actionPrompt: string;
  extraCharacterIds: string[];
  aliasMap: Record<string, string>;
  camera: string;
  aspectRatio: AspectRatio16x9;
  style: string;
  styleIntensity: number;
  compareMode: boolean;
  compareStyle: string;
};

type GenerateFormPreset = { id: string; name: string; updatedAt: number; data: GenerateFormState };
type Tab = 'generate' | 'animate' | 'gallery';

type PresetCatalogResponse = {
  presets?: {
    location?: PresetOption[];
    camera?: PresetOption[];
    style?: PresetOption[];
  };
};

function compressBackgroundReference(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Csak képfájlt válassz.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('A kép nem olvasható.'));
    };
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDimension = 2048;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('A kép feldolgozása sikertelen.'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('A kép tömörítése sikertelen.')),
        'image/jpeg',
        0.82,
      );
    };
    image.src = objectUrl;
  });
}

const Gallery = dynamic(() => import('./Gallery'), { ssr: false });
const ImageEditChat = dynamic(() => import('./ImageEditChat'), { ssr: false });
const AnimationPanel = dynamic(() => import('./AnimationPanel'), { ssr: false });

function mergeOptions(defaults: PresetOption[], incoming: PresetOption[] | undefined): PresetOption[] {
  const map = new Map(defaults.map((item) => [item.value, item]));
  for (const item of incoming || []) {
    if (!item?.value) continue;
    map.set(item.value, { value: item.value, label: item.label || item.value });
  }
  return Array.from(map.values());
}

export default function CharacterDetailPage() {
  const params = useParams();
  const primaryCharacterId = Array.isArray(params.id) ? params.id[0] : String(params.id || '');
  const [character, setCharacter] = useState<Character | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'paid' | 'admin'>('free');
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [cameraOptions, setCameraOptions] = useState(DEFAULT_CAMERA_OPTIONS);
  const [styleOptions, setStyleOptions] = useState(DEFAULT_STYLE_OPTIONS);
  const [locationPresetOptions, setLocationPresetOptions] = useState(DEFAULT_LOCATION_OPTIONS);

  const [location, setLocation] = useState('');
  const [lighting, setLighting] = useState('');
  const [locationPreset, setLocationPreset] = useState<LocationPreset>('urban-street');
  const [locationGeometry, setLocationGeometry] = useState('');
  const [locationPalette, setLocationPalette] = useState('');
  const [locationProps, setLocationProps] = useState('');
  const [locationCameraContinuity, setLocationCameraContinuity] = useState('');
  const [lockGeometry, setLockGeometry] = useState(true);
  const [lockLighting, setLockLighting] = useState(true);
  const [lockPalette, setLockPalette] = useState(true);
  const [lockProps, setLockProps] = useState(true);
  const [lockCameraRules, setLockCameraRules] = useState(true);
  const [continuityNotes, setContinuityNotes] = useState('');
  const [actionPrompt, setActionPrompt] = useState('');
  const [extraCharacterIds, setExtraCharacterIds] = useState<string[]>([]);
  const [pendingCharacterId, setPendingCharacterId] = useState('');
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});
  const [locationHistory, setLocationHistory] = useState<string[]>([]);
  const [lightingHistory, setLightingHistory] = useState<string[]>([]);
  const [camera, setCamera] = useState('medium');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio16x9>('landscape-16-9');
  const [style, setStyle] = useState('gritty');
  const [styleIntensity, setStyleIntensity] = useState(65);
  const [compareMode, setCompareMode] = useState(false);
  const [compareStyle, setCompareStyle] = useState('noir-bw');

  const [presetName, setPresetName] = useState('');
  const [characterPresets, setCharacterPresets] = useState<GenerateFormPreset[]>([]);
  const [globalPresets, setGlobalPresets] = useState<GenerateFormPreset[]>([]);
  const [selectedCharacterPresetId, setSelectedCharacterPresetId] = useState('');
  const [selectedGlobalPresetId, setSelectedGlobalPresetId] = useState('');
  const [storageInfo, setStorageInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editChatOpen, setEditChatOpen] = useState(false);
  const [editGenerationId, setEditGenerationId] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<ImageInfo[]>([]);
  const [animatePreselectedUrl, setAnimatePreselectedUrl] = useState('');
  const [generatedReferenceImages, setGeneratedReferenceImages] = useState<Array<{ id: string; path: string; url: string; created: number }>>([]);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [referenceLayerOpen, setReferenceLayerOpen] = useState(false);
  const [backgroundReferencePath, setBackgroundReferencePath] = useState('');
  const [backgroundReferenceUrl, setBackgroundReferenceUrl] = useState('');
  const [backgroundReferenceUploading, setBackgroundReferenceUploading] = useState(false);
  const [backgroundReferenceError, setBackgroundReferenceError] = useState('');

  const hydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundReferenceInputRef = useRef<HTMLInputElement | null>(null);

  const getCharacterFormKey = (id: string) => `${CHAR_FORM_KEY_PREFIX}.${id}`;
  const getCharacterPresetsKey = (id: string) => `${CHAR_PRESETS_KEY_PREFIX}.${id}`;

  const parseStoredJson = <T,>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  };

  const createFormSnapshot = (): GenerateFormState => ({
    location, lighting, locationPreset, locationGeometry, locationPalette, locationProps,
    locationCameraContinuity, lockGeometry, lockLighting, lockPalette, lockProps, lockCameraRules,
    continuityNotes, actionPrompt, extraCharacterIds, aliasMap, camera, aspectRatio, style, styleIntensity,
    compareMode, compareStyle,
  });

  const applyFormSnapshot = (snapshot: Partial<GenerateFormState>) => {
    if (typeof snapshot.location === 'string') setLocation(snapshot.location);
    if (typeof (snapshot as any).lighting === 'string') setLighting((snapshot as any).lighting);
    else if (typeof (snapshot as any).mood === 'string') setLighting((snapshot as any).mood);
    if (typeof snapshot.locationPreset === 'string') setLocationPreset(snapshot.locationPreset);
    if (typeof snapshot.locationGeometry === 'string') setLocationGeometry(snapshot.locationGeometry);
    if (typeof snapshot.locationPalette === 'string') setLocationPalette(snapshot.locationPalette);
    if (typeof snapshot.locationProps === 'string') setLocationProps(snapshot.locationProps);
    if (typeof snapshot.locationCameraContinuity === 'string') setLocationCameraContinuity(snapshot.locationCameraContinuity);

    if (typeof snapshot.lockGeometry === 'boolean') setLockGeometry(snapshot.lockGeometry);
    if (typeof snapshot.lockLighting === 'boolean') setLockLighting(snapshot.lockLighting);
    if (typeof snapshot.lockPalette === 'boolean') setLockPalette(snapshot.lockPalette);
    if (typeof snapshot.lockProps === 'boolean') setLockProps(snapshot.lockProps);
    if (typeof snapshot.lockCameraRules === 'boolean') setLockCameraRules(snapshot.lockCameraRules);
    if (typeof snapshot.continuityNotes === 'string') setContinuityNotes(snapshot.continuityNotes);
    if (typeof snapshot.actionPrompt === 'string') setActionPrompt(snapshot.actionPrompt);
    if (Array.isArray(snapshot.extraCharacterIds)) setExtraCharacterIds(snapshot.extraCharacterIds.filter(Boolean));
    if (snapshot.aliasMap && typeof snapshot.aliasMap === 'object') setAliasMap(snapshot.aliasMap);
    if (typeof snapshot.camera === 'string') setCamera(snapshot.camera);
    if (typeof snapshot.aspectRatio === 'string') setAspectRatio(snapshot.aspectRatio as AspectRatio16x9);
    if (typeof snapshot.style === 'string') setStyle(snapshot.style);
    if (typeof snapshot.styleIntensity === 'number' && Number.isFinite(snapshot.styleIntensity)) setStyleIntensity(Math.max(0, Math.min(100, Math.round(snapshot.styleIntensity))));
    if (typeof snapshot.compareMode === 'boolean') setCompareMode(snapshot.compareMode);
    if (typeof snapshot.compareStyle === 'string') setCompareStyle(snapshot.compareStyle);
  };

  const loadPresets = (scope: 'character' | 'global', id?: string): GenerateFormPreset[] => {
    const key = scope === 'character' ? getCharacterPresetsKey(id || '') : GLOBAL_PRESETS_KEY;
    if (scope === 'character' && !id) return [];
    const parsed = parseStoredJson<GenerateFormPreset[]>(key);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item.data).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  };

  const savePresets = (scope: 'character' | 'global', presets: GenerateFormPreset[], id?: string) => {
    const key = scope === 'character' ? getCharacterPresetsKey(id || '') : GLOBAL_PRESETS_KEY;
    if (scope === 'character' && !id) return;
    localStorage.setItem(key, JSON.stringify(presets));
  };

  const saveNewPreset = (scope: 'character' | 'global') => {
    const name = presetName.trim() || `Preset ${new Date().toLocaleString()}`;
    const nextPreset: GenerateFormPreset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, updatedAt: Date.now(), data: createFormSnapshot() };
    if (scope === 'character') {
      const next = [nextPreset, ...characterPresets].slice(0, 30);
      setCharacterPresets(next); setSelectedCharacterPresetId(nextPreset.id); savePresets(scope, next, primaryCharacterId);
    } else {
      const next = [nextPreset, ...globalPresets].slice(0, 30);
      setGlobalPresets(next); setSelectedGlobalPresetId(nextPreset.id); savePresets(scope, next);
    }
    setStorageInfo(`Saved ${scope} preset: ${name}`);
  };

  const overwritePreset = (scope: 'character' | 'global', id: string) => {
    const current = scope === 'character' ? characterPresets : globalPresets;
    const next = current.map((item) => item.id === id ? { ...item, name: presetName.trim() || item.name, updatedAt: Date.now(), data: createFormSnapshot() } : item);
    if (scope === 'character') { setCharacterPresets(next); savePresets(scope, next, primaryCharacterId); }
    else { setGlobalPresets(next); savePresets(scope, next); }
    setStorageInfo(`Updated ${scope} preset.`);
  };

  const loadPresetById = (scope: 'character' | 'global', id: string) => {
    const source = scope === 'character' ? characterPresets : globalPresets;
    const picked = source.find((item) => item.id === id);
    if (!picked) return;
    applyFormSnapshot(picked.data); setPresetName(picked.name); setStorageInfo(`Loaded ${scope} preset: ${picked.name}`);
  };

  const deletePresetById = (scope: 'character' | 'global', id: string) => {
    const source = scope === 'character' ? characterPresets : globalPresets;
    const next = source.filter((item) => item.id !== id);
    if (scope === 'character') { setCharacterPresets(next); savePresets(scope, next, primaryCharacterId); setSelectedCharacterPresetId(''); }
    else { setGlobalPresets(next); savePresets(scope, next); setSelectedGlobalPresetId(''); if (localStorage.getItem(GLOBAL_DEFAULT_PRESET_KEY) === id) localStorage.removeItem(GLOBAL_DEFAULT_PRESET_KEY); }
    setStorageInfo(`Deleted ${scope} preset.`);
  };

  useEffect(() => {
    fetch('/api/me').then((res) => res.json()).then((data) => {
      if (data?.authenticated) setUserPlan(data.plan === 'paid' || data.plan === 'admin' ? data.plan : 'free');
    }).catch(() => setUserPlan('free'));
  }, []);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/presets', { cache: 'no-store' });
        const data: PresetCatalogResponse = await response.json();
        if (!response.ok) throw new Error('Failed to load presets');
        setCameraOptions(mergeOptions(DEFAULT_CAMERA_OPTIONS, data.presets?.camera));
        setStyleOptions(mergeOptions(DEFAULT_STYLE_OPTIONS, data.presets?.style));
        setLocationPresetOptions(mergeOptions(DEFAULT_LOCATION_OPTIONS, data.presets?.location));
      } catch (e) {
        console.error(e);
      }
    };
    loadCatalog();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreviewImage(null);
      setReferenceLayerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    fetch('/api/characters').then((res) => res.json()).then((chars: Character[]) => {
      setAllCharacters(chars); setCharacter(chars.find((c) => c.id === primaryCharacterId) || null);
    }).catch(() => setError('Failed to load characters'));
  }, [primaryCharacterId]);

  useEffect(() => {
    if (!character) return;
    setAliasMap((prev) => prev[character.id] ? prev : { ...prev, [character.id]: character.name?.trim()?.slice(0, 1).toUpperCase() || 'A' });
  }, [character]);

  useEffect(() => {
    if (!primaryCharacterId) return;
    hydratedRef.current = false;
    setCharacterPresets(loadPresets('character', primaryCharacterId));
    const globals = loadPresets('global');
    setGlobalPresets(globals);
    const savedForm = parseStoredJson<GenerateFormState>(getCharacterFormKey(primaryCharacterId));
    if (savedForm) {
      applyFormSnapshot(savedForm); setStorageInfo('Loaded last settings for this character.');
    } else {
      const defaultId = localStorage.getItem(GLOBAL_DEFAULT_PRESET_KEY);
      const defaultPreset = defaultId ? globals.find((item) => item.id === defaultId) : undefined;
      if (defaultPreset) { applyFormSnapshot(defaultPreset.data); setSelectedGlobalPresetId(defaultPreset.id); setStorageInfo(`Loaded global default preset: ${defaultPreset.name}`); }
    }
    hydratedRef.current = true;
  }, [primaryCharacterId]);

  useEffect(() => {
    try {
      const savedLocation = JSON.parse(localStorage.getItem(LOCATION_HISTORY_KEY) || '[]');
      const savedLighting = JSON.parse(localStorage.getItem(LIGHTING_HISTORY_KEY) || localStorage.getItem('illustration.mood.history') || '[]');
      if (Array.isArray(savedLocation)) setLocationHistory(savedLocation.filter((item) => typeof item === 'string'));
      if (Array.isArray(savedLighting)) setLightingHistory(savedLighting.filter((item) => typeof item === 'string'));
    } catch {}
  }, []);

  useEffect(() => {
    if (!primaryCharacterId || !hydratedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      localStorage.setItem(getCharacterFormKey(primaryCharacterId), JSON.stringify(createFormSnapshot()));
      setStorageInfo('Auto-saved current form.');
    }, 300);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [primaryCharacterId, location, lighting, locationPreset, locationGeometry, locationPalette, locationProps, locationCameraContinuity, lockGeometry, lockLighting, lockPalette, lockProps, lockCameraRules, continuityNotes, actionPrompt, extraCharacterIds, aliasMap, camera, aspectRatio, style, styleIntensity, compareMode, compareStyle]);

  const loadGeneratedImages = async () => {
    if (!primaryCharacterId) return;
    try {
      const response = await fetch(`/api/generated/${primaryCharacterId}/list`);
      const data = await response.json();
      setGeneratedImages((data.images || []).filter((img: any) => img.url));
    } catch {}
  };

  const loadReferenceImages = async () => {
    if (!primaryCharacterId || character?.type !== 'system' || userPlan !== 'admin') return;
    try {
      const response = await fetch(`/api/characters/${primaryCharacterId}/images`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Nem sikerült betölteni a referenciaképeket.');
      setGeneratedReferenceImages(data.images || []);
    } catch (error: any) {
      setReferenceError(error?.message || 'Nem sikerült betölteni a referenciaképeket.');
    }
  };

  const handleReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const slotsLeft = Math.max(0, 6 - generatedReferenceImages.length);
    if (files.length > slotsLeft) {
      setReferenceError(`Még ${slotsLeft} referenciahely maradt.`);
      return;
    }

    setReferenceUploading(true);
    setReferenceError('');
    const uploadedPaths: string[] = [];

    const readJsonResponse = async (response: Response) => {
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || 'A szerver nem érvényes JSON választ adott.');
      }
    };

    const cleanupUploads = async () => {
      if (!uploadedPaths.length) return;
      try {
        await fetch(`/api/characters/${primaryCharacterId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'cleanup', paths: uploadedPaths }),
        });
      } catch {
        // Best-effort cleanup.
      }
    };

    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Csak JPG, PNG vagy WebP kép tölthető fel.');
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`Egy referencia-kép legfeljebb 8 MB lehet: ${file.name}`);
        }
      }

      const prepareResponse = await fetch(`/api/characters/${primaryCharacterId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'prepare',
          files: files.map((file) => ({ contentType: file.type, size: file.size })),
        }),
      });
      const prepareData = await readJsonResponse(prepareResponse);
      if (!prepareResponse.ok) {
        throw new Error(prepareData?.error || 'A referencia-képek feltöltésének előkészítése sikertelen.');
      }

      const uploads = Array.isArray(prepareData?.uploads) ? prepareData.uploads : [];
      if (uploads.length !== files.length) {
        throw new Error('A szerver nem készített elég feltöltési jogosultságot.');
      }

      const supabase = createSupabaseBrowserClient();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const upload = uploads[index];
        const { error: uploadError } = await supabase.storage
          .from('v3-media')
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: file.type,
            cacheControl: '3600',
          });
        if (uploadError) {
          throw new Error(`A referencia-kép feltöltése sikertelen: ${uploadError.message}`);
        }
        uploadedPaths.push(upload.path);
      }

      const response = await fetch(`/api/characters/${primaryCharacterId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'complete', uploadedPaths }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || 'A feltöltés sikertelen.');

      await loadReferenceImages();
      uploadedPaths.length = 0;
    } catch (error: any) {
      setReferenceError(error?.message || 'A feltöltés sikertelen.');
    } finally {
      setReferenceUploading(false);
    }
  };

  const handleDeleteReferenceImage = async (imageId: string) => {
    if (!window.confirm('Biztosan törlöd ezt a referenciaképet?')) return;
    setReferenceError('');
    try {
      const response = await fetch(`/api/characters/${primaryCharacterId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'A törlés sikertelen.');
      await loadReferenceImages();
    } catch (error: any) {
      setReferenceError(error?.message || 'A törlés sikertelen.');
    }
  };

  useEffect(() => { loadGeneratedImages(); }, [primaryCharacterId]);
  useEffect(() => { loadReferenceImages(); }, [primaryCharacterId, character?.type, userPlan]);
  useEffect(() => { if (result || compareResult) loadGeneratedImages(); }, [result, compareResult]);

  const persistHistoryValue = (key: string, value: string, current: string[], setState: (next: string[]) => void) => {
    const trimmed = value.trim(); if (!trimmed) return;
    const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 12);
    setState(next); localStorage.setItem(key, JSON.stringify(next));
  };

  const applyLightingPreset = (value: string) => {
    const preset = LIGHTING_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setLighting(preset.prompt);
    persistHistoryValue(LIGHTING_HISTORY_KEY, preset.prompt, lightingHistory, setLightingHistory);
  };

  const handleBackgroundReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBackgroundReferenceError('Csak képfájlt válassz.');
      return;
    }

    setBackgroundReferenceUploading(true);
    setBackgroundReferenceError('');
    try {
      const compressed = await compressBackgroundReference(file);
      const uploadUrlResponse = await fetch('/api/generate/background-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', size: compressed.size }),
      });
      const uploadUrlData = await uploadUrlResponse.json();
      if (!uploadUrlResponse.ok) {
        throw new Error(uploadUrlData?.error || 'A referencia-kép feltöltési jogosultságának létrehozása sikertelen.');
      }

      const path = String(uploadUrlData.path || '');
      const token = String(uploadUrlData.token || '');
      if (!path || !token) throw new Error('Hiányzó feltöltési token.');

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from('v3-media')
        .uploadToSignedUrl(path, token, compressed, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });
      if (uploadError) throw new Error(uploadError.message);

      const previewResponse = await fetch(
        '/api/generate/background-reference?path=' + encodeURIComponent(path),
        { cache: 'no-store' },
      );
      const previewData = await previewResponse.json();
      if (!previewResponse.ok) {
        throw new Error(previewData?.error || 'A referencia-kép előnézete nem tölthető be.');
      }

      if (backgroundReferencePath) {
        try {
          await fetch('/api/generate/background-reference', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: backgroundReferencePath }),
          });
        } catch {}
      }

      setBackgroundReferencePath(path);
      setBackgroundReferenceUrl(String(previewData.url || ''));
    } catch (error: any) {
      setBackgroundReferencePath('');
      setBackgroundReferenceUrl('');
      setBackgroundReferenceError(error?.message || 'A referencia-kép feltöltése sikertelen.');
    } finally {
      setBackgroundReferenceUploading(false);
    }
  };

  const clearBackgroundReference = async () => {
    const path = backgroundReferencePath;
    setBackgroundReferencePath('');
    setBackgroundReferenceUrl('');
    setBackgroundReferenceError('');
    if (!path) return;

    try {
      await fetch('/api/generate/background-reference', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
    } catch {}
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    persistHistoryValue(LOCATION_HISTORY_KEY, location, locationHistory, setLocationHistory);
    persistHistoryValue(LIGHTING_HISTORY_KEY, lighting, lightingHistory, setLightingHistory);
    setLoading(true); setError(''); setResult(null); setCompareResult(null);
    try {
      const characterIds = [primaryCharacterId, ...extraCharacterIds].filter(Boolean);
      const selectedAliasMap: Record<string, string> = {};
      for (const id of characterIds) if (aliasMap[id]?.trim()) selectedAliasMap[id] = aliasMap[id].trim();
      const compareStylePayload = compareMode && compareStyle !== style ? compareStyle : undefined;
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: primaryCharacterId, characterIds, aliasMap: selectedAliasMap, location, lighting, actionPrompt,
          backgroundReferencePath: backgroundReferencePath || undefined,
          scenePackage: { locationProfile: { preset: locationPreset, detail: location, geometry: locationGeometry, lightingAndTime: lighting, paletteAndTexture: locationPalette, fixedProps: locationProps, cameraContinuity: locationCameraContinuity }, continuity: { lockGeometry, lockLighting, lockPalette, lockProps, lockCameraRules, notes: continuityNotes.trim() || undefined }, bilingualInput: { sourceLanguage: 'mixed' } },
          camera, aspectRatio, style, styleIntensity, compareStyle: compareStylePayload,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate image');
      setResult(data.image); setCompareResult(data.compareImage || null); setEditGenerationId(data.generationId || null);
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    } finally { setLoading(false); }
  };

  const selectedCharacters = [
    ...(character ? [character] : []),
    ...extraCharacterIds.map((id) => allCharacters.find((item) => item.id === id)).filter((item): item is Character => Boolean(item)),
  ];
  const availableCharacters = allCharacters.filter((item) => item.id !== primaryCharacterId && !extraCharacterIds.includes(item.id));

  const addExtraCharacter = () => {
    if (!pendingCharacterId || extraCharacterIds.includes(pendingCharacterId)) return;
    const picked = allCharacters.find((item) => item.id === pendingCharacterId);
    setExtraCharacterIds((prev) => [...prev, pendingCharacterId]);
    if (picked) setAliasMap((prev) => ({ ...prev, [pendingCharacterId]: prev[pendingCharacterId] || picked.name?.trim()?.slice(0, 1).toUpperCase() || 'C' }));
    setPendingCharacterId('');
  };

  const removeExtraCharacter = (id: string) => setExtraCharacterIds((prev) => prev.filter((value) => value !== id));
  const handleUseForAnimation = (url: string) => { setAnimatePreselectedUrl(url); setActiveTab('animate'); };

  const locationPresetCount = useMemo(() => locationPresetOptions.length, [locationPresetOptions]);
  const isPaid = userPlan === 'paid' || userPlan === 'admin';
  if (!character) return <LoadingScreen />;

  return (
    <main className="min-h-screen bg-black text-gray-100 font-mono flex flex-col items-center mt-6">
      <div className="w-full max-w-6xl px-6 md:px-0">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Új jelenet</h1>

          <div className="flex min-w-0 items-center justify-end gap-3">
            <div className="max-w-[220px] truncate text-right text-sm font-semibold text-gray-300">
              {character.name}
            </div>
            {(character.imagePaths || []).slice(0, 1).map((img: string, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (character.type === 'system' && userPlan === 'admin') setReferenceLayerOpen(true);
                }}
                disabled={character.type !== 'system' || userPlan !== 'admin'}
                className={`shrink-0 overflow-hidden rounded-lg border border-gray-800 bg-zinc-950 ${
                  character.type === 'system' && userPlan === 'admin'
                    ? 'cursor-pointer transition hover:border-gray-600'
                    : 'cursor-default'
                }`}
                aria-label={character.type === 'system' && userPlan === 'admin' ? 'Referenciaképek megnyitása' : undefined}
              >
                <img src={img} alt={character.name || 'Karakter'} className="h-12 w-12 object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 mb-4 bg-zinc-950 rounded-lg border border-gray-800 p-1">
          {(['generate', ...(isPaid ? ['animate'] : []), 'gallery'] as Tab[]).map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded text-sm font-semibold ${activeTab === tab ? 'bg-zinc-800 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-zinc-800'}`}>{tab === 'generate' ? '✨ ' : tab === 'animate' ? '▶ ' : '🖼 '}{tab === 'generate' ? 'Generálás' : tab === 'animate' ? 'Videó' : 'Galéria'}</button>)}
        </div>

        <div className="bg-zinc-950 rounded-lg">
          {activeTab === 'generate' && (
            <>
              {!isPaid && (
                <div className="mb-4 rounded-lg border border-gray-800 bg-zinc-950 p-4 text-xs text-zinc-500">
                  FREE mód · 6 ingyenes kredit · alap generátor
                </div>
              )}

              <form onSubmit={handleGenerate} className="mb-8 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-sm font-semibold text-gray-300">Helyszín</label>
                    <select
                      className="w-full sm:w-auto sm:min-w-[280px] rounded bg-gray-900 border border-gray-700 p-2 text-sm"
                      value={locationPreset}
                      onChange={(e) => setLocationPreset(e.target.value)}
                      aria-label="Helyszín preset"
                    >
                      {locationPresetOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <textarea
                    className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    rows={3}
                    placeholder="Hol történjen a jelenet? A preset az alap környezetet adja, ezt itt pontosíthatod."
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-gray-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-sm font-semibold text-gray-300">Háttér-referencia <span className="font-normal text-gray-600">opcionális</span></label>
                      <div className="mt-1 text-[11px] leading-5 text-gray-600">
                        Az AI a kép környezetét és kompozícióját veszi alapul, majd újraépíti a jelenetet a figurádhoz igazítva.
                      </div>
                    </div>
                    <input
                      ref={backgroundReferenceInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleBackgroundReferenceUpload}
                      disabled={backgroundReferenceUploading || loading}
                    />
                    <button
                      type="button"
                      onClick={() => backgroundReferenceInputRef.current?.click()}
                      disabled={backgroundReferenceUploading || loading}
                      className="shrink-0 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {backgroundReferenceUploading ? 'Feldolgozás…' : backgroundReferencePath ? 'Kép cseréje' : 'Kép kiválasztása'}
                    </button>
                  </div>

                  {backgroundReferenceUrl && (
                    <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-black">
                      <img
                        src={backgroundReferenceUrl}
                        alt="Háttér-referencia előnézete"
                        className="max-h-72 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearBackgroundReference}
                        disabled={loading}
                        className="absolute right-2 top-2 rounded-md bg-black/80 px-2 py-1 text-[11px] text-gray-300 hover:bg-black hover:text-white disabled:opacity-50"
                      >
                        Eltávolítás
                      </button>
                    </div>
                  )}

                  {!backgroundReferenceUrl && (
                    <button
                      type="button"
                      onClick={() => backgroundReferenceInputRef.current?.click()}
                      disabled={backgroundReferenceUploading || loading}
                      className="flex min-h-24 w-full items-center justify-center rounded-lg border border-dashed border-gray-800 bg-black/20 text-xs text-gray-600 transition hover:border-gray-600 hover:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Kattints és válassz képet a gépedről
                    </button>
                  )}

                  {backgroundReferenceError && (
                    <div className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                      {backgroundReferenceError}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-sm font-semibold text-gray-300">Fények, világítás</label>
                    <select
                      className="w-full sm:w-auto sm:min-w-[280px] rounded bg-gray-900 border border-gray-700 p-2 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        applyLightingPreset(e.target.value);
                        e.currentTarget.value = '';
                      }}
                      aria-label="Világítás preset"
                    >
                      <option value="">Világítás preset választása…</option>
                      {LIGHTING_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
                    value={lighting}
                    onChange={(e) => setLighting(e.target.value)}
                    list="lighting-history"
                    placeholder="Pl. hajnal, hideg szórt ablakfény, felülről érkező kemény fény…"
                  />
                  <datalist id="lighting-history">{lightingHistory.map((item) => <option key={item} value={item} />)}</datalist>
                  <div className="text-[11px] leading-5 text-gray-600">
                    A preset csak kiindulópont. A mezőbe szabadon írhatsz saját világítási leírást is.
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-semibold text-gray-300">Mi történjen?</label>
                  <textarea
                    className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
                    value={actionPrompt}
                    onChange={(e) => setActionPrompt(e.target.value)}
                    rows={4}
                    placeholder="Írd le, mit csináljon a karakter."
                  />
                </div>

                <div className="rounded-lg border border-gray-800 bg-zinc-950 p-4">
                  <div className="text-sm font-semibold text-gray-300 mb-3">Szereplők</div>

                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setExtraCharacterIds([]); setPendingCharacterId(""); }}
                      className={selectedCharacters.length === 1 ? "flex-1 px-3 py-2 rounded border border-white bg-white text-black text-xs font-semibold" : "flex-1 px-3 py-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-semibold"}
                    >
                      1 karakter
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingCharacterId((current) => current || availableCharacters[0]?.id || "")}
                      disabled={!availableCharacters.length}
                      className={selectedCharacters.length > 1 ? "flex-1 px-3 py-2 rounded border border-white bg-white text-black text-xs font-semibold" : "flex-1 px-3 py-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-semibold"}
                    >
                      2 karakter
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedCharacters.map((item) => (
                      <span key={item.id} className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                        {item.name}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <select
                      className="flex-1 p-2 rounded bg-gray-900 border border-gray-700 text-sm"
                      value={pendingCharacterId}
                      onChange={(e) => setPendingCharacterId(e.target.value)}
                    >
                      <option value="">+ Második karakter</option>
                      {availableCharacters.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addExtraCharacter}
                      disabled={!pendingCharacterId}
                      className="px-3 py-2 rounded bg-gray-800 border border-gray-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Hozzáadás
                    </button>
                  </div>

                  {selectedCharacters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => { setExtraCharacterIds([]); setPendingCharacterId(""); }}
                      className="mt-3 text-xs px-3 py-2 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                    >
                      Vissza 1 karakterre
                    </button>
                  )}

                  {isPaid && selectedCharacters.length > 1 && (
                    <div className="mt-3 space-y-2">
                      {selectedCharacters.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <div className="w-40 text-xs text-gray-400 truncate">{item.name}</div>
                          <input
                            className="w-28 p-1.5 rounded bg-gray-900 border border-gray-700 text-xs"
                            value={aliasMap[item.id] || ""}
                            onChange={(e) => setAliasMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Alias"
                            maxLength={12}
                          />
                          {item.id !== primaryCharacterId && (
                            <button type="button" onClick={() => removeExtraCharacter(item.id)} className="text-xs px-2 py-1 rounded border border-gray-700">
                              Törlés
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <label className="text-sm font-semibold text-gray-300">Kamera</label>
                    <span className="text-[10px] text-gray-600">objektív · nézőpont · látószög · perspektíva</span>
                  </div>
                  <select className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm" value={camera} onChange={(e) => setCamera(e.target.value)}>
                    {cameraOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-semibold text-gray-300">Képarány</label>
                  <select
                    className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio16x9)}
                  >
                    {ASPECT_RATIO_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-semibold text-gray-300">Stílus</label>
                  <select
                    className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                  >
                    {styleOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                {isPaid && (
                  <>
                    <details className="rounded-lg border border-gray-800 bg-zinc-950 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-gray-300">Haladó generálás</summary>
                      <div className="pt-4 space-y-4">
                        <div>
                          <label className="block mb-1 text-sm font-semibold text-gray-300">Generálási presetek</label>
                          <select className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={selectedGlobalPresetId} onChange={(e) => setSelectedGlobalPresetId(e.target.value)}>
                            <option value="">Nincs kiválasztva</option>
                            {globalPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button" className="px-2 py-1 rounded bg-gray-800 text-xs" onClick={() => saveNewPreset('global')}>Mentés</button>
                            <button type="button" className="px-2 py-1 rounded border border-gray-700 text-xs" disabled={!selectedGlobalPresetId} onClick={() => loadPresetById('global', selectedGlobalPresetId)}>Betöltés</button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block mb-1 text-sm font-semibold text-gray-300">Geometria</label>
                            <textarea className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={locationGeometry} onChange={(e) => setLocationGeometry(e.target.value)} rows={2} />
                          </div>
                          <div>
                            <label className="block mb-1 text-sm font-semibold text-gray-300">Paletta és textúra</label>
                            <textarea className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={locationPalette} onChange={(e) => setLocationPalette(e.target.value)} rows={2} />
                          </div>
                          <div>
                            <label className="block mb-1 text-sm font-semibold text-gray-300">Fix kellékek</label>
                            <textarea className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={locationProps} onChange={(e) => setLocationProps(e.target.value)} rows={2} />
                          </div>
                          <div>
                            <label className="block mb-1 text-sm font-semibold text-gray-300">Kamerafolytonossági szabályok</label>
                            <textarea className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={locationCameraContinuity} onChange={(e) => setLocationCameraContinuity(e.target.value)} rows={2} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={lockGeometry} onChange={(e) => setLockGeometry(e.target.checked)} />Geometria rögzítése</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={lockLighting} onChange={(e) => setLockLighting(e.target.checked)} />Világítás rögzítése</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={lockPalette} onChange={(e) => setLockPalette(e.target.checked)} />Paletta rögzítése</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={lockProps} onChange={(e) => setLockProps(e.target.checked)} />Kellékek rögzítése</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={lockCameraRules} onChange={(e) => setLockCameraRules(e.target.checked)} />Kamerafolytonosság rögzítése</label>
                        </div>

                        <div>
                          <label className="block mb-1 text-sm font-semibold text-gray-300">Continuity notes</label>
                          <textarea className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={continuityNotes} onChange={(e) => setContinuityNotes(e.target.value)} rows={2} />
                        </div>

                        <div>
                          <label className="block mb-1 text-sm font-semibold text-gray-300">Style intensity: {styleIntensity}</label>
                          <input type="range" min={0} max={100} value={styleIntensity} onChange={(e) => setStyleIntensity(Number(e.target.value))} className="w-full accent-indigo-500" />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
                          A/B összehasonlítás
                        </label>

                        {compareMode && (
                          <div>
                            <label className="block mb-1 text-sm font-semibold text-gray-300">Második stílus</label>
                            <select className="w-full p-2 rounded bg-gray-900 border border-gray-700 text-sm" value={compareStyle} onChange={(e) => setCompareStyle(e.target.value)}>
                              {styleOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </details>

                    {storageInfo && <div className="text-xs text-gray-500">{storageInfo}</div>}
                  </>
                )}

                {error && <div className="text-red-400 text-sm bg-red-950/50 border border-red-900 rounded px-3 py-2">{error}</div>}

                <button type="submit" disabled={loading || backgroundReferenceUploading} className="w-full bg-white hover:bg-gray-200 text-black disabled:opacity-50 py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                  {loading ? 'Generálás…' : '✨ Kép generálása'}
                </button>
              </form>

              {result && (
                <div className="space-y-4">
                  {compareResult ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-900 rounded p-3">
                        <div className="text-xs text-gray-400 mb-2">A: {style}</div>
                        <button type="button" className="w-full" onClick={() => setPreviewImage(result)}>
                          <img src={result} alt="A" className="rounded w-full cursor-zoom-in" />
                        </button>
                      </div>
                      <div className="bg-gray-900 rounded p-3">
                        <div className="text-xs text-gray-400 mb-2">B: {compareStyle}</div>
                        <button type="button" className="w-full" onClick={() => setPreviewImage(compareResult)}>
                          <img src={compareResult} alt="B" className="rounded w-full cursor-zoom-in" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <button type="button" className="focus:outline-none rounded" onClick={() => setPreviewImage(result)}>
                        <img src={result} alt="Generated scene" className="rounded shadow-lg max-w-full cursor-zoom-in" />
                      </button>
                      {editGenerationId && (
                        <button
                          type="button"
                          onClick={() => setEditChatOpen(true)}
                          className="w-full max-w-xl rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:border-gray-500 hover:bg-gray-800"
                        >
                          ✎ Kép szerkesztése chatben
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {isPaid && activeTab === 'animate' && (
            <AnimationPanel
              characterId={primaryCharacterId}
              images={generatedImages}
              initialSelectedUrl={animatePreselectedUrl || undefined}
              characterIds={[primaryCharacterId, ...extraCharacterIds].filter(Boolean)}
            />
          )}

          {activeTab === 'gallery' && (
            <Gallery
              characterId={primaryCharacterId}
              onUseForAnimation={isPaid ? handleUseForAnimation : undefined}
              onEdit={({ id, url }) => {
                setResult(url);
                setEditGenerationId(id);
                setEditChatOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {editChatOpen && result && editGenerationId && (
        <ImageEditChat
          open={editChatOpen}
          imageUrl={result}
          generationId={editGenerationId}
          primaryCharacterId={primaryCharacterId}
          characters={allCharacters.map((item) => ({ id: item.id, name: item.name, type: item.type }))}
          onClose={() => setEditChatOpen(false)}
          onImageChange={(imageUrl, generationId) => {
            setResult(imageUrl);
            setEditGenerationId(generationId);
            setCompareResult(null);
            void loadGeneratedImages();
          }}
        />
      )}

      {referenceLayerOpen && character.type === 'system' && userPlan === 'admin' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setReferenceLayerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reference-layer-title"
        >
          <div
            className="w-full max-w-4xl rounded-xl border border-gray-800 bg-zinc-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">ADMIN / REFERENCIA</div>
                <h2 id="reference-layer-title" className="text-base font-bold text-white">Referenciaképek</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600">{generatedReferenceImages.length} / 6</span>
                <button
                  type="button"
                  onClick={() => setReferenceLayerOpen(false)}
                  className="rounded-lg border border-gray-800 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-900 hover:text-white"
                  aria-label="Referenciaképek bezárása"
                >
                  Bezárás
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {generatedReferenceImages.map((image, index) => (
                  <div key={image.id || image.path} className="group relative overflow-hidden rounded-lg border border-gray-800 bg-black">
                    <img src={image.url} alt={`V referencia ${index + 1}`} className="aspect-square h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleDeleteReferenceImage(image.id)}
                      className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/80 px-2 py-1 text-[10px] text-gray-300 group-hover:block hover:bg-red-950 hover:text-red-200"
                    >
                      Törlés
                    </button>
                  </div>
                ))}
                {generatedReferenceImages.length < 6 && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-700 bg-black/30 text-center transition hover:border-gray-500 hover:bg-zinc-900">
                    <span className="text-xl text-gray-500">+</span>
                    <span className="mt-1 px-2 text-[10px] text-gray-500">Kép hozzáadása</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleReferenceUpload}
                      disabled={referenceUploading}
                    />
                  </label>
                )}
              </div>
              {referenceUploading && <div className="mt-3 text-xs text-gray-500">Feltöltés…</div>}
              {referenceError && <div className="mt-3 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">{referenceError}</div>}
            </div>
          </div>
        </div>
      )}

      {previewImage && <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)} role="dialog" aria-modal="true"><div className="relative max-w-6xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => setPreviewImage(null)} className="absolute -top-10 right-0 text-white text-sm bg-gray-800 px-3 py-1 rounded">Close</button><img src={previewImage} alt="Preview" className="max-h-[85vh] max-w-full object-contain rounded shadow-2xl" /></div></div>}
    </main>
  );
}
