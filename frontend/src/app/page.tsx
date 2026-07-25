"use client";

import { useState, useRef, useEffect, useCallback, useActionState } from "react";
import { validateDispute } from "./actions";
import { motion, AnimatePresence } from "framer-motion";
import { fetchEventSource } from '@microsoft/fetch-event-source';

type DebateTurn = {
  agent: string;
  argument: string;
};

type Verdict = {
  winner: string;
  confidence_score: number;
  justification: string;
  scores?: Record<string, number>;
};

const TEMPLATES = {
  default: {
    id: "DSP-90124",
    claim: "I did not make this purchase. My card was stolen.",
    logs: '{\n  "auth_method": "3D_SECURE_V2",\n  "ip": "192.168.1.42",\n  "device_fingerprint": "match_99%",\n  "otp_verified": true\n}',
    images: [] as string[]
  },
  sim_swap: {
    id: "DSP-SIM-552",
    claim: "My phone was hacked and my SIM was swapped. The OTP was intercepted by the hackers.",
    logs: '{\n  "auth_method": "3D_SECURE_V2",\n  "ip": "45.22.11.9 (Unrecognized IP)",\n  "device_fingerprint": "mismatch",\n  "otp_verified": true,\n  "carrier_change_detected": true\n}',
    images: [] as string[]
  },
  friendly_fraud: {
    id: "DSP-FF-991",
    claim: "I never received the digital game key I purchased.",
    logs: '{\n  "auth_method": "AUTO",\n  "ip": "192.168.1.42 (Historical Match)",\n  "digital_delivery_status": "claimed",\n  "account_playtime_hours": 14\n}',
    images: [] as string[]
  },
  complex: {
    id: "DSP-CPLX-808",
    claim: "I ordered a high-end gaming laptop to my home. The tracking says it was delivered at 2:15 PM, but I was on a flight at the exact time. I checked my Ring camera and no one came to the door.",
    logs: '{\n  "auth_method": "3D_SECURE_V2",\n  "ip": "203.0.113.45 (Residential, Matches City)",\n  "device_fingerprint": "match_98%",\n  "shipping_address": "MATCHES_BILLING",\n  "delivery_status": "SIGNED_FOR_BY_RESIDENT",\n  "signature_image_hash": "a4d3f2..."\n}',
    images: [] as string[]
  }
};

export default function Home() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, action, isPending] = useActionState<any, FormData>(validateDispute, {
    success: false,
    errors: null,
    data: null
  });

  const [formData, setFormData] = useState(TEMPLATES.default);
  const [debateHistory, setDebateHistory] = useState<DebateTurn[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const lastProcessedState = useRef<unknown>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const startResolution = useCallback(async (data: unknown) => {
    setIsResolving(true);
    setDebateHistory([]);
    setVerdict(null);
    setActiveNode("Initializing Engine");

    try {
      await fetchEventSource("http://localhost:8000/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(data),
        onopen() {
          return Promise.resolve();
        },
        onmessage(ev) {
          if (ev.event === "close" || ev.data === "done") {
             setIsResolving(false);
             setActiveNode("Session Concluded");
             return;
          }
          
          if (ev.event === "message") {
            try {
              const parsed = JSON.parse(ev.data);
              setActiveNode(parsed.node);
              
              if (parsed.state.debate_history) {
                setDebateHistory(parsed.state.debate_history);
              }
              
              if (parsed.state.verdict) {
                setVerdict(parsed.state.verdict);
              }
            } catch (e) {
              console.error("Error parsing SSE event:", e);
            }
          }
        },
        onerror() {
          setIsResolving(false);
          setActiveNode("Connection Error");
          throw new Error("Connection lost");
        }
      });
    } catch (e) {
      console.error(e);
      setIsResolving(false);
      setActiveNode("Connection Failed");
    }
  }, []);

  useEffect(() => {
    if (state.success && state.data && state !== lastProcessedState.current) {
      lastProcessedState.current = state;
      startResolution(state.data);
    }
  }, [state, startResolution]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debateHistory, verdict]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setFileName(`${files.length} file(s) selected`);
      
      const base64Promises = files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      
      const base64Images = await Promise.all(base64Promises);
      setFormData(prev => ({ ...prev, images: base64Images }));
    } else {
      setFileName(null);
      setFormData(prev => ({ ...prev, images: [] }));
    }
  };

  const handleDownloadAudit = () => {
    if (!verdict) return;
    let content = `CHARGEBACK DISPUTE AUDIT TRAIL\\nID: ${formData.id}\\n\\n`;
    content += `CUSTOMER CLAIM:\\n${formData.claim}\\n\\n`;
    content += `MERCHANT LOGS:\\n${formData.logs}\\n\\n`;
    content += `--- DEBATE TRANSCRIPT ---\\n\\n`;
    debateHistory.forEach(turn => {
      content += `[${turn.agent.toUpperCase()}]\\n${turn.argument}\\n\\n`;
    });
    content += `--- FINAL VERDICT ---\\n`;
    content += `WINNER: ${verdict.winner.toUpperCase()}\\n`;
    content += `CONFIDENCE: ${(verdict.confidence_score * 100).toFixed(1)}%\\n`;
    content += `JUSTIFICATION: ${verdict.justification}\\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Report_${formData.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAgentIcon = (agent: string) => {
    if (agent === 'customer') return <span className="font-mono text-[10px] font-bold">USR</span>;
    if (agent === 'merchant') return <span className="font-mono text-[10px] font-bold">MCH</span>;
    return <span className="font-mono text-[10px] font-bold">ARB</span>;
  };

  const getAgentColor = (agent: string) => {
    if (agent === 'customer') return 'bg-[#111111] border-[#333] text-gray-200';
    if (agent === 'merchant') return 'bg-[#111111] border-[#333] text-gray-200';
    return 'bg-[#1a1510] border-[#554020] text-amber-100';
  };

  return (
    <main className="min-h-screen flex flex-col items-center">
      
      {/* Premium Typographic Header */}
      <header className="w-full bg-[#050505] border-b border-[#222] sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-white text-black font-bold flex items-center justify-center text-xs tracking-tighter">
              CR
            </div>
            <div>
              <h1 className="text-base font-medium tracking-tight text-white">
                Chargeback Resolve
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                Automated Arbitration Engine
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest font-medium border ${isResolving ? 'bg-[#00ff00]/10 border-[#00ff00]/20 text-[#00ff00]' : 'bg-white/5 border-white/10 text-gray-400'}`}>
              {isResolving ? (
                <>
                  <div className="w-1.5 h-1.5 bg-[#00ff00] rounded-none animate-pulse" />
                  ANALYSIS_ACTIVE
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 bg-gray-500 rounded-none" />
                  SYSTEM_READY
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-[1400px] p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* SIDEBAR: Configuration */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#050505] border border-[#222] p-6">
            <h2 className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-6 flex items-center gap-2 border-b border-[#222] pb-4">
              <span className="w-2 h-2 bg-gray-500" />
              DISPUTE_PARAMETERS
            </h2>

            {/* Scenario Templates */}
            <div className="mb-8 space-y-3">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">SCENARIOS</label>
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => setFormData(TEMPLATES.default)} type="button" className="px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-gray-400 bg-[#111] border border-[#333] hover:text-white hover:border-gray-400 transition-colors">
                  STD
                </button>
                <button onClick={() => setFormData(TEMPLATES.sim_swap)} type="button" className="px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-gray-400 bg-[#111] border border-[#333] hover:text-white hover:border-gray-400 transition-colors">
                  SIM
                </button>
                <button onClick={() => setFormData(TEMPLATES.friendly_fraud)} type="button" className="px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-gray-400 bg-[#111] border border-[#333] hover:text-white hover:border-gray-400 transition-colors">
                  FF
                </button>
                <button onClick={() => setFormData(TEMPLATES.complex)} type="button" className="px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-gray-400 bg-[#111] border border-[#333] hover:text-white hover:border-gray-400 transition-colors">
                  CPLX
                </button>
              </div>
            </div>
            
            <form action={action} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-medium text-gray-400">DISPUTE_ID</label>
                <input 
                  type="text" 
                  name="dispute_id" 
                  value={formData.id}
                  onChange={e => setFormData({...formData, id: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-[#333] text-sm font-mono text-white px-4 py-2.5 focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-medium text-gray-400">CLAIM_STATEMENT</label>
                <textarea 
                  name="customer_claim" 
                  rows={3}
                  value={formData.claim}
                  onChange={e => setFormData({...formData, claim: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-[#333] text-sm text-white px-4 py-3 focus:outline-none focus:border-white transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-medium text-gray-400">TELEMETRY_LOGS</label>
                <textarea 
                  name="merchant_logs" 
                  rows={6}
                  value={formData.logs}
                  onChange={e => setFormData({...formData, logs: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-[#333] text-xs font-mono text-gray-300 px-4 py-3 focus:outline-none focus:border-white transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] uppercase tracking-widest font-medium text-gray-400">SUPPORTING_EVIDENCE</label>
                <div className="relative">
                  <input 
                    type="file" 
                    id="file-upload"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="flex items-center justify-center gap-2 w-full border border-dashed border-[#444] bg-[#0a0a0a] py-3 px-4 text-[10px] uppercase tracking-widest text-gray-400 hover:text-white hover:border-white transition-colors cursor-pointer">
                    {fileName ? fileName : "+ SELECT_IMAGES"}
                  </label>
                  <input type="hidden" name="customer_images" value={JSON.stringify(formData.images)} />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={isPending || isResolving}
                  className="w-full bg-white text-black text-xs font-bold uppercase tracking-widest py-3.5 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending || isResolving ? "EXECUTING..." : "START_ARBITRATION"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* MAIN CANVAS: The Arena */}
        <div className="lg:col-span-8 flex flex-col h-[800px] bg-[#050505] border border-[#222] relative overflow-hidden">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#222] bg-[#000000] flex items-center justify-between z-10">
            <h3 className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">ARBITRATION_FEED</h3>
            {activeNode && (
              <span className="text-[10px] font-mono text-gray-300 bg-[#111] border border-[#333] px-2 py-1 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#00ff00] animate-pulse" />
                {activeNode}
              </span>
            )}
          </div>

          {/* Stream Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scroll-smooth z-10">
            {!lastProcessedState && debateHistory.length === 0 && (
              <div className="flex flex-col h-full items-center justify-center text-[#333] font-mono text-xs uppercase tracking-widest">
                [ AWAITING_INPUT ]
              </div>
            )}

            <AnimatePresence>
              {debateHistory.map((turn, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col gap-2 max-w-[90%] ${turn.agent === 'merchant' ? 'ml-auto items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 flex items-center justify-center ${turn.agent === 'customer' ? 'bg-[#111] text-white border border-[#333]' : turn.agent === 'merchant' ? 'bg-white text-black' : 'bg-transparent text-amber-500 border border-amber-500/30'}`}>
                      {getAgentIcon(turn.agent)}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">
                      {turn.agent}
                    </span>
                  </div>
                  
                  <div className={`p-4 text-sm leading-relaxed ${getAgentColor(turn.agent)}`}>
                    {turn.argument}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {verdict && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-12 p-8 bg-[#000000] border-t border-[#333] relative max-w-3xl mx-auto"
              >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white to-transparent opacity-20" />
                
                <div className="flex flex-col items-center text-center mb-10">
                  <h3 className="text-sm font-mono font-bold text-gray-400 tracking-widest uppercase mb-4">
                    FINAL_RESOLUTION
                  </h3>
                  <div className="inline-flex items-center gap-3 px-6 py-2 border border-[#333] bg-[#111]">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">WINNER:</span>
                    <span className={`text-sm font-bold uppercase tracking-widest ${verdict.winner === 'merchant' ? 'text-white' : 'text-white'}`}>
                      {verdict.winner}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-1 mb-10 bg-[#222] p-[1px]">
                  {verdict.scores && Object.entries(verdict.scores).map(([key, val]) => (
                    <div key={key} className="bg-[#050505] p-5 flex flex-col items-center justify-center gap-3">
                      <span className="text-[9px] uppercase tracking-widest text-gray-500 font-mono text-center leading-tight">
                        {key.replace('_', '\\n')}
                      </span>
                      <span className="text-xl font-mono text-white">
                        {(Number(val) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="border-l-2 border-[#333] pl-6 mb-10">
                  <p className="text-sm text-gray-300 leading-relaxed font-sans">
                    {verdict.justification}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-3 w-full mx-auto mb-10">
                  <div className="flex justify-between w-full text-[10px] font-mono uppercase tracking-widest text-gray-500">
                    <span>AGGREGATE_CONFIDENCE</span>
                    <span className="text-white">{(verdict.confidence_score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#111] overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${verdict.confidence_score * 100}%` }}
                      transition={{ delay: 0.8, duration: 1 }}
                      className="h-full bg-white"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={handleDownloadAudit}
                  className="w-full bg-transparent text-gray-400 font-bold font-mono text-[10px] uppercase tracking-widest py-4 border border-[#333] hover:text-white hover:border-white transition-colors"
                >
                  [ DOWNLOAD_AUDIT_TRAIL ]
                </button>
              </motion.div>
            )}
            <div ref={endOfMessagesRef} className="h-8" />
          </div>
        </div>
      </div>
    </main>
  );
}
