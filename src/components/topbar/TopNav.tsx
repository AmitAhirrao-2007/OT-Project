import React, { useState } from 'react';
import { usePlanner, SettingsTab } from '../../context/PlannerContext';
import { ThemeChoice } from '../../types/settings';
import {
  User,
  Menu,
  X,
  Car,
  Zap,
  Compass,
  Monitor,
  ShieldCheck,
  History,
  Sliders,
  Bookmark,
  Search,
  Sun,
  Moon
} from 'lucide-react';

export const TopNav: React.FC = () => {
  const {
    openSettingsTab,
    setIsLoginModalOpen,
    setIsOptionsModalOpen,
    setIsChargerFinderOpen,
    setIsSavedPlansOpen,
    setIsOperatorPortalOpen,
    displaySettings,
    setDisplaySettings,
    resolvedTheme,
    showToast
  } = usePlanner();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems: { label: string; icon: any; tab: SettingsTab }[] = [
    { label: 'Vehicle Settings', icon: Car, tab: 'vehicle' },
    { label: 'Charging Networks & Amenities', icon: Zap, tab: 'charging' },
    { label: 'Routing Preferences', icon: Compass, tab: 'routing' },
    { label: 'Display & Units', icon: Monitor, tab: 'display' },
    { label: 'Privacy & Data', icon: ShieldCheck, tab: 'privacy' },
    { label: 'Drive & Charge History', icon: History, tab: 'history' }
  ];

  const handleCycleTheme = () => {
    const cycle: Record<ThemeChoice, ThemeChoice> = {
      light: 'dark',
      dark: 'system',
      system: 'light'
    };
    const nextTheme = cycle[displaySettings.theme] || 'light';
    setDisplaySettings((prev) => ({ ...prev, theme: nextTheme }));
    showToast(`Appearance: ${nextTheme === 'system' ? 'System (Auto)' : nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)}`);
  };

  return (
    <>
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Charger Discovery Explorer Button */}
        <button
          type="button"
          onClick={() => setIsChargerFinderOpen(true)}
          title="Charger Finder & Hub Explorer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-xs font-semibold shadow-card transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-amber-500" />
          <span>Chargers</span>
        </button>

        {/* Saved Plans Button */}
        <button
          type="button"
          onClick={() => setIsSavedPlansOpen(true)}
          title="Saved Route Plans"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-xs font-semibold shadow-card transition-colors"
        >
          <Bookmark className="w-3.5 h-3.5 text-status-success" />
          <span>Saved Plans</span>
        </button>

        {/* Operator Portal Button (Solid Modern Styling) */}
        <button
          type="button"
          onClick={() => setIsOperatorPortalOpen(true)}
          title="EVSure Operator Portal - Live Queue & Hub Management"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 border border-violet-500 text-white text-xs font-semibold shadow-card transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-violet-200" />
          <span>Operator</span>
        </button>

        {/* Quick Options Button */}
        <button
          type="button"
          onClick={() => setIsOptionsModalOpen(true)}
          title="Quick Plan Options"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-xs font-semibold shadow-card transition-colors"
        >
          <Sliders className="w-3.5 h-3.5 text-brand-primary" />
          <span>Plan Options</span>
        </button>

        {/* Quick Theme Toggle Button */}
        <button
          type="button"
          onClick={handleCycleTheme}
          title={`Appearance: ${displaySettings.theme} (click to cycle)`}
          aria-label="Toggle theme appearance"
          className="p-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary shadow-card transition-colors flex items-center justify-center"
        >
          {displaySettings.theme === 'system' ? (
            <Monitor className="w-4 h-4 text-brand-primary" />
          ) : resolvedTheme === 'dark' ? (
            <Moon className="w-4 h-4 text-amber-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
        </button>

        {/* Login Button */}
        <button
          type="button"
          onClick={() => setIsLoginModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-xs font-semibold shadow-card transition-colors"
        >
          <User className="w-3.5 h-3.5 text-content-tertiary" />
          <span>Login</span>
        </button>

        {/* Hamburger Menu Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Open Menu"
            aria-label="Navigation menu"
            className="p-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary shadow-card transition-colors"
          >
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-surface-panel border border-edge-default rounded-2xl shadow-panel overflow-hidden py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3.5 py-2 border-b border-edge-subtle mb-1">
                <span className="text-[11px] font-bold text-content-tertiary uppercase tracking-wider">
                  Tools & Itineraries
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsChargerFinderOpen(true);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-content-primary hover:bg-surface-hover flex items-center gap-2.5 transition-colors"
              >
                <Search className="w-4 h-4 text-amber-500" />
                <span>Charger Discovery Explorer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsSavedPlansOpen(true);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-content-primary hover:bg-surface-hover flex items-center gap-2.5 transition-colors"
              >
                <Bookmark className="w-4 h-4 text-status-success" />
                <span>Saved Route Plans</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsOperatorPortalOpen(true);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-violet-400 hover:bg-violet-950/30 flex items-center gap-2.5 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                <span>Operator Portal</span>
              </button>

              <div className="px-3.5 py-2 border-b border-t border-edge-subtle my-1">
                <span className="text-[11px] font-bold text-content-tertiary uppercase tracking-wider">
                  Settings & Profiles
                </span>
              </div>

              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      openSettingsTab(item.tab);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-content-primary hover:bg-surface-hover flex items-center gap-2.5 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-brand-primary" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="mt-1 pt-1 border-t border-edge-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsLoginModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-content-primary hover:bg-surface-hover flex items-center gap-2.5 transition-colors"
                >
                  <User className="w-4 h-4 text-status-success" />
                  <span>Account & Cloud Sync</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
