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
            className="px-4 py-2 rounded-lg bg-[#242424] hover:bg-[#2c2c2c] text-[#EEEEEE] border border-[#383838] text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 font-bold text-xs shadow-md transition-colors"
          >
            Save Card
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-[#202020] rounded-xl border border-[#303030] flex items-center gap-2 text-[#EEEEEE]">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Demonstration entry only. Stored locally in your browser storage. No financial or bank card data is requested.
          </span>
        </div>

        <div>
          <label className="block text-[#EEEEEE] font-semibold mb-1">Card Label / Name</label>
          <input
            type="text"
            required
            placeholder="e.g. My Adani RFID Tag"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full bg-[#161616] border border-[#333333] rounded-lg px-3 py-2 text-sm text-[#EEEEEE] placeholder-[#707070] focus:outline-none focus:border-[#00b0ff]"
          />
        </div>

        <div>
          <label className="block text-[#EEEEEE] font-semibold mb-1">Charging Network</label>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="w-full bg-[#161616] border border-[#333333] rounded-lg px-3 py-2 text-sm text-[#EEEEEE] focus:outline-none focus:border-[#00b0ff]"
          >
            {availableNetworks.map((n) => (
              <option key={n} value={n} className="bg-[#161616] text-[#EEEEEE]">
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[#EEEEEE] font-semibold mb-1">Tag / Account Digits (Last 4)</label>
          <div className="relative">
            <CreditCard className="w-4 h-4 text-[#707070] absolute left-3 top-2.5" />
            <input
              type="text"
              maxLength={4}
              placeholder="7890"
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value)}
              className="w-full bg-[#161616] border border-[#333333] rounded-lg pl-9 pr-3 py-2 text-sm text-[#EEEEEE] placeholder-[#707070] focus:outline-none focus:border-[#00b0ff]"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

