import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { availableNetworks } from '../../data/demoSettings';

interface AddChargeCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddChargeCardModal: React.FC<AddChargeCardModalProps> = ({ isOpen, onClose }) => {
  const { setChargingSettings, showToast } = usePlanner();
  const [cardName, setCardName] = useState('');
  const [network, setNetwork] = useState(availableNetworks[0]);
  const [lastFour, setLastFour] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim()) return;

    const newCard = {
      id: `card-${Date.now()}`,
      name: cardName.trim(),
      network,
      accountNumberMasked: `•••• •••• •••• ${lastFour.slice(-4) || '1234'}`
    };

    setChargingSettings((prev) => ({
      ...prev,
      chargeCards: [...prev.chargeCards, newCard]
    }));

    showToast(`Added charge card: ${newCard.name}`);
    setCardName('');
    setLastFour('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Charge Card / RFID Tag"
      subtitle="Register an operator RFID key or membership card"
      maxWidth="max-w-md"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-colors"
          >
            Save Card
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle flex items-center gap-2 text-content-primary">
          <ShieldCheck className="w-4 h-4 text-status-success shrink-0" />
          <span className="text-content-secondary leading-relaxed">
            Demonstration entry only. Stored locally in your browser storage. No financial or bank card data is requested.
          </span>
        </div>

        <div>
          <label className="block text-content-primary font-semibold mb-1">Card Label / Name</label>
          <input
            type="text"
            required
            placeholder="e.g. My RFID Card / Tag"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-content-primary font-semibold mb-1">Charging Network</label>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand-primary"
          >
            {availableNetworks.map((n) => (
              <option key={n} value={n} className="bg-surface-panel text-content-primary">
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-content-primary font-semibold mb-1">
            Account / Card Number Suffix (Optional)
          </label>
          <div className="relative flex items-center">
            <CreditCard className="w-4 h-4 text-content-tertiary absolute left-3" />
            <input
              type="text"
              maxLength={4}
              placeholder="Last 4 digits (e.g. 8492)"
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-surface-panel border border-edge-default rounded-lg pl-9 pr-3 py-2 text-sm text-content-primary font-mono placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
