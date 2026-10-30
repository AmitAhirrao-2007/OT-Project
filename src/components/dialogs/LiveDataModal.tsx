import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { Radio, Bluetooth, AlertCircle, Info } from 'lucide-react';

export const LiveDataModal: React.FC = () => {
  const { isLiveDataModalOpen, setIsLiveDataModalOpen, vehicle } = usePlanner();

  return (
    <Modal
      isOpen={isLiveDataModalOpen}
      onClose={() => setIsLiveDataModalOpen(false)}
      title="Connect Live Data"
      subtitle={`Vehicle telemetry setup for ${vehicle.name}`}
      maxWidth="max-w-lg"
      footer={
        <button
          type="button"
          onClick={() => setIsLiveDataModalOpen(false)}
          className="px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold shadow-sm"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Status Callout */}
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-700 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="block text-amber-800 dark:text-amber-300 font-semibold mb-0.5">
              Live Telemetry Hardware Required
            </strong>
            A compatible live-data adapter (such as an OBDLink CX / BLE dongle, Torque Pro,
            or manufacturer API gateway) has not yet been configured for this session.
          </div>
        </div>

        <p className="text-content-primary leading-relaxed">
          In production, Live Data feeds actual battery State of Charge (SoC), real-time battery
          cell temperature, ambient weather, and elevation consumption deltas directly into the
          routing engine to dynamically adjust charging recommendations on the road.
        </p>

        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle space-y-2.5">
          <div className="font-semibold text-content-primary uppercase tracking-wider text-[11px]">
            Supported Telemetry Protocols
          </div>
          <div className="space-y-2 text-content-secondary">
            <div className="flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-brand-primary" />
              <span>OBD-II Bluetooth Low Energy (BLE 4.0+)</span>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-status-success" />
              <span>Direct OEM Cloud Gateway API</span>
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" />
              <span>Standard OBD Webhook (Torque Pro / EVNotify)</span>
            </div>
          </div>
        </div>

        <p className="text-content-tertiary italic">
          Note: This is a reference-based prototype environment. Live vehicle connections are not
          simulated without legitimate physical hardware or verified API credentials.
        </p>
      </div>
    </Modal>
  );
};
