import React, { useState } from 'react';
import { usePlanner, SettingsTab } from '../../context/PlannerContext';
import { User, Menu, X, Car, Zap, Compass, Monitor, ShieldCheck, History, Sliders } from 'lucide-react';

export const TopNav: React.FC = () => {
  const {
    openSettingsTab,
    setIsLoginModalOpen,
    setIsOptionsModalOpen
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

  return (
    <>
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Quick Options Button */}
        <button
          type="button"
          onClick={() => setIsOptionsModalOpen(true)}
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a232f]/95 hover:bg-[#253242] border border-[#2c3a4a] text-slate-200 text-xs font-semibold shadow-xl backdrop-blur-md transition-colors"
        >
          <Sliders className="w-3.5 h-3.5 text-[#00b0ff]" />
          <span>Plan Options</span>
        </button>

        {/* Login Button */}
        <button
          type="button"
          onClick={() => setIsLoginModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a232f]/95 hover:bg-[#253242] border border-[#2c3a4a] text-slate-200 text-xs font-semibold shadow-xl backdrop-blur-md transition-colors"
        >
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span>Login</span>
        </button>

        {/* Hamburger Menu Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Open Menu"
            aria-label="Navigation menu"
            className="p-2 rounded-xl bg-[#1a232f]/95 hover:bg-[#253242] border border-[#2c3a4a] text-slate-200 shadow-xl backdrop-blur-md transition-colors"
          >
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-[#18212b] border border-[#2b3a4a] rounded-xl shadow-2xl overflow-hidden py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3.5 py-2 border-b border-[#243343] mb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-[#233140] flex items-center gap-2.5 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-[#00b0ff]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="mt-1 pt-1 border-t border-[#243343]">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsLoginModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-[#233140] flex items-center gap-2.5 transition-colors"
                >
                  <User className="w-4 h-4 text-emerald-400" />
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
