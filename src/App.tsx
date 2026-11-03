import React from 'react';
import { PlannerProvider, usePlanner } from './context/PlannerContext';
import { GpsProvider } from './context/GpsContext';
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
import { OperatorPortalModal } from './components/operator/OperatorPortalModal';
import { DriverCheckInModal } from './components/operator/DriverCheckInModal';
import { CheckCircle2 } from 'lucide-react';

const PlannerApp: React.FC = () => {
  const {
    toastMessage,
    isChargerFinderOpen,
    setIsChargerFinderOpen,
    isSavedPlansOpen,
    setIsSavedPlansOpen,
    isOperatorPortalOpen,
    setIsOperatorPortalOpen,
    isDriverCheckInOpen,
    setIsDriverCheckInOpen,
    driverCheckInStation,
    setDriverCheckInStation,
    operatorStationId
  } = usePlanner();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface-canvas text-content-primary font-sans">
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
      <OperatorPortalModal
        isOpen={isOperatorPortalOpen}
        onClose={() => setIsOperatorPortalOpen(false)}
        initialStationId={operatorStationId}
      />
      <DriverCheckInModal
        isOpen={isDriverCheckInOpen}
        onClose={() => {
          setIsDriverCheckInOpen(false);
          setDriverCheckInStation(null);
        }}
        station={driverCheckInStation}
      />

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-panel border border-edge-default text-content-primary px-4 py-2.5 rounded-lg shadow-dropdown flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-brand-primary" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PlannerProvider>
      <GpsProvider>
        <PlannerApp />
      </GpsProvider>
    </PlannerProvider>
  );
};

export default App;
