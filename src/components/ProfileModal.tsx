import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { LogIn, LogOut, Upload, X } from 'lucide-react';
import { STUDIO_AVATARS } from '../lib/firebase';
import { AvatarImage } from './AvatarImage';
import type { FrameworkOption, ProviderOption, UserProfileData } from '../types/workflow';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  profile: UserProfileData;
  authBusy: boolean;
  authError: string | null;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSaveProfile: (updated: UserProfileData) => Promise<void>;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Could not decode selected image.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

export function ProfileModal({
  open,
  onClose,
  isSignedIn,
  profile,
  authBusy,
  authError,
  onSignInGoogle,
  onSignOut,
  onSaveProfile,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [roleTitle, setRoleTitle] = useState(profile.roleTitle);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [preferredFramework, setPreferredFramework] = useState<FrameworkOption>(profile.preferredFramework);
  const [preferredProvider, setPreferredProvider] = useState<ProviderOption>(profile.preferredProvider);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose a valid PNG, JPG, or WebP image file.');
      return;
    }
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch {
      setUploadError('Something went wrong, try again');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setUploadError('Display name is required.');
      return;
    }
    setSaving(true);
    setUploadError(null);
    try {
      await onSaveProfile({
        ...profile,
        displayName: displayName.trim(),
        roleTitle: roleTitle.trim(),
        bio: bio.trim(),
        avatarUrl,
        preferredFramework,
        preferredProvider,
      });
      onClose();
    } catch {
      setUploadError('Something went wrong, try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 id="profile-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Account &amp; Profile Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {!isSignedIn ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Sign in to sync with Firestore</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Save your profile picture, agent preferences, and cyclic workflow runs across devices.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={onSignInGoogle}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  {authBusy ? 'Signing In…' : 'Sign In with Google'}
                </button>
              </div>
              {authError && (
                <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                  {authError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">Signed in as {profile.email}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Synced with Firebase Firestore</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Sign Out
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Profile Picture</span>
              <div className="flex flex-wrap items-center gap-4">
                <AvatarImage src={avatarUrl} alt={displayName || 'User profile avatar'} sizeClass="w-16 h-16" />

                <div className="space-y-2 flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      aria-label="Upload custom profile picture"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      Upload Photo
                    </button>

                    <div className="flex items-center gap-1.5">
                      {STUDIO_AVATARS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setAvatarUrl(preset.url)}
                          aria-label={`Select ${preset.label}`}
                          className={`rounded-full p-0.5 border transition-colors ${
                            avatarUrl === preset.url
                              ? 'border-teal-700 dark:border-teal-400'
                              : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <AvatarImage src={preset.url} alt={preset.label} sizeClass="w-7 h-7" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Upload a custom portrait or pick a studio avatar. Saved automatically to your profile.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label htmlFor="profile-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Role / Title
                </label>
                <input
                  id="profile-role"
                  type="text"
                  maxLength={80}
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="AI Systems Engineer"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Engineering Bio
              </label>
              <textarea
                id="profile-bio"
                rows={2}
                maxLength={400}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="profile-framework" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Orchestrator
                </label>
                <select
                  id="profile-framework"
                  value={preferredFramework}
                  onChange={(e) => setPreferredFramework(e.target.value as FrameworkOption)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="langgraph">LangGraph</option>
                  <option value="crewai">CrewAI</option>
                </select>
              </div>
              <div>
                <label htmlFor="profile-provider" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Inference Provider
                </label>
                <select
                  id="profile-provider"
                  value={preferredProvider}
                  onChange={(e) => setPreferredProvider(e.target.value as ProviderOption)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="google">Google AI Studio (Gemini)</option>
                  <option value="groq">Groq (Llama 3.3 70B)</option>
                </select>
              </div>
            </div>

            {uploadError && (
              <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                {uploadError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
