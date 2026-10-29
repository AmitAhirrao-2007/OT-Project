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
import { CheckCircle2 } from 'lucide-react';

const PlannerApp: React.FC = () => {
  const { toastMessage } = usePlanner();

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-row bg-[#12161a] text-slate-100 font-sans">
      {/* Route-Results Panel on the left */}
      <RoutePanel />

      {/* Full-viewport interactive map area */}
      <main className="relative flex-1 h-full overflow-hidden">
        <MapView />
        <TopNav />
      </main>

      {/* Modals & Dialogs */}
      <PlanOptionsModal />
      <SettingsModal />
      <StationDetailsModal />
      <LoginModal />
      <LiveDataModal />
      <PlugTypesModal />
      <ReplaceVehicleModal />

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
