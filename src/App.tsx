import React from 'react';
import { PlannerProvider, usePlanner } from './context/PlannerContext';
import { MapView } from './components/map/MapView';
import { RoutePanel } from './components/route/RoutePanel';
import { TopNav } from './components/topbar/TopNav';
import { PlanOptionsModal } from './components/dialogs/PlanOptionsModal';
import { SettingsModal } from './components/dialogs/SettingsModal';
import { StationDetailsModal } from './components/dialogs/StationDetailsModal';
import { LoginModal } from './components/dialogs/LoginModal';
import { LiveDataModal } from './components/dialogs/LiveDataModal';
import { PlugTypesModal } from './components/dialogs/PlugTypesModal';
import { ReplaceVehicleModal } from './components/dialogs/ReplaceVehicleModal';
import { ChargerFinderModal } from './components/charger/ChargerFinderModal';
import { SavedPlansModal } from './components/dialogs/SavedPlansModal';
import { CheckCircle2 } from 'lucide-react';

const PlannerApp: React.FC = () => {
  const {
    toastMessage,
    isChargerFinderOpen,
    setIsChargerFinderOpen,
    isSavedPlansOpen,
    setIsSavedPlansOpen
  } = usePlanner();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#101010] text-[#EEEEEE] font-sans">
      {/* Full-viewport interactive map occupying the entire background */}
      <main className="absolute inset-0 w-full h-full overflow-hidden z-0">
        <MapView />
        <TopNav />
      </main>

      {/* Floating Route-Results Panel on the left */}
      <RoutePanel />

      {/* Modals & Dialogs */}
      <PlanOptionsModal />
      <SettingsModal />
      <StationDetailsModal />
      <LoginModal />
      <LiveDataModal />
      <PlugTypesModal />
      <ReplaceVehicleModal />
      <ChargerFinderModal
        isOpen={isChargerFinderOpen}
        onClose={() => setIsChargerFinderOpen(false)}
      />
      <SavedPlansModal
        isOpen={isSavedPlansOpen}
        onClose={() => setIsSavedPlansOpen(false)}
      />

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#16212d] border border-[#2c3d52] text-slate-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-[#00b0ff]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PlannerProvider>
      <PlannerApp />
    </PlannerProvider>
  );
};

export default App;
