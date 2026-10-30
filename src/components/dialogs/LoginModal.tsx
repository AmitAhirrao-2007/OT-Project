import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { Lock, Mail, CheckCircle2 } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, showToast } = usePlanner();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoginModalOpen(false);
    showToast(`Signed in successfully as ${email || 'guest@ev-planner.internal'}`);
  };

  return (
    <Modal
      isOpen={isLoginModalOpen}
      onClose={() => setIsLoginModalOpen(false)}
      title="Sign In to Route Planner"
      subtitle="Sync vehicle profiles, custom routes, and telemetry logs"
      maxWidth="max-w-md"
      footer={
        <div className="flex items-center justify-between w-full text-xs">
          <span className="text-content-tertiary">Non-production demo auth</span>
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(false)}
            className="px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default font-semibold shadow-sm"
          >
            Cancel
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle text-xs text-content-primary flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-brand-primary shrink-0" />
          <span className="leading-relaxed text-content-secondary">
            Offline reference session is enabled. You can continue as a demo guest
            or test profile sign-in.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-content-tertiary absolute left-3 top-2.5" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@example.com"
              className="w-full bg-surface-panel border border-edge-default rounded-lg pl-9 pr-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-content-primary mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-content-tertiary absolute left-3 top-2.5" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-surface-panel border border-edge-default rounded-lg pl-9 pr-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-sm shadow-sm transition-all mt-2"
        >
          Sign In
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLoginModalOpen(false);
            showToast('Continuing as Demonstration Guest User');
          }}
          className="w-full py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold transition-colors"
        >
          Continue as Guest Demo
        </button>
      </form>
    </Modal>
  );
};
