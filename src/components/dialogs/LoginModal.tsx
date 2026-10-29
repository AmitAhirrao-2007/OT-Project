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
    showToast(`Signed in successfully as ${email || 'guest@abrp-demo.internal'}`);
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
          <span className="text-[#A8A8A8]">Non-production demo auth</span>
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(false)}
            className="px-4 py-2 rounded-lg bg-[#242424] hover:bg-[#2c2c2c] text-[#EEEEEE] border border-[#383838] font-semibold"
          >
            Cancel
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-[#202020] rounded-xl border border-[#303030] text-xs text-[#EEEEEE] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#00b0ff] shrink-0" />
          <span>
            Offline reference session is enabled. You can continue as a demo guest
            or test profile sign-in.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#EEEEEE] mb-1">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#707070] absolute left-3 top-2.5" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@example.com"
              className="w-full bg-[#161616] border border-[#333333] rounded-lg pl-9 pr-3 py-2 text-sm text-[#EEEEEE] placeholder-[#707070] focus:outline-none focus:border-[#00b0ff]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#EEEEEE] mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#707070] absolute left-3 top-2.5" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#161616] border border-[#333333] rounded-lg pl-9 pr-3 py-2 text-sm text-[#EEEEEE] placeholder-[#707070] focus:outline-none focus:border-[#00b0ff]"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all mt-2"
        >
          Sign In
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLoginModalOpen(false);
            showToast('Continuing as Demonstration Guest User');
          }}
          className="w-full py-2 rounded-lg bg-[#242424] hover:bg-[#2c2c2c] text-[#EEEEEE] border border-[#383838] text-xs font-semibold transition-colors"
        >
          Continue as Guest Demo
        </button>
      </form>
    </Modal>
  );
};
