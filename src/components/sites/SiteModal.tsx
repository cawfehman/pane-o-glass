import React from 'react';

interface SiteModalProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    currentSite: any;
    setCurrentSite: (site: any) => void;
    performAction: (action: 'add' | 'update' | 'delete', siteData: any, addAnother?: boolean) => Promise<boolean>;
    actionLoading: boolean;
}

export function SiteModal({ isModalOpen, setIsModalOpen, currentSite, setCurrentSite, performAction, actionLoading }: SiteModalProps) {
    if (!isModalOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            backdropFilter: 'blur(8px)'
        }}>
            <div className="glass-card w-full max-w-md shadow-[0_0_50px_rgba(0,0,0,0.9)] relative overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200" style={{ maxWidth: '90%', width: '450px' }}>
                {actionLoading && (
                    <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-3 border-accent-primary border-t-transparent animate-spin"></div>
                            <p className="text-xs font-bold text-white">Saving Record Entry...</p>
                        </div>
                    </div>
                )}
                <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/[0.02]">
                    <h3 className="text-sm font-black tracking-tight text-white uppercase">Provision New Site</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-white font-bold text-base">&times;</button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div>
                        <label className="block text-[10px] font-black text-accent-primary uppercase tracking-widest mb-1.5">Site Code (Unique Id)</label>
                        <input 
                            type="text" 
                            value={currentSite.code} 
                            onChange={e => setCurrentSite({...currentSite, code: e.target.value.toUpperCase()})}
                            placeholder="e.g. LON"
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-black text-white text-xs"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Descriptive Identity</label>
                        <input 
                            type="text" 
                            value={currentSite.name} 
                            onChange={e => setCurrentSite({...currentSite, name: e.target.value})}
                            placeholder="e.g. London Tech Campus"
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold text-white text-xs"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Physical Address</label>
                        <textarea 
                            rows={2}
                            value={currentSite.address} 
                            onChange={e => setCurrentSite({...currentSite, address: e.target.value})}
                            placeholder="Street, District, Postal Code"
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium"
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Lifecycle Status</label>
                        <select 
                            value={currentSite.status} 
                            onChange={e => setCurrentSite({...currentSite, status: e.target.value})}
                            className="w-full px-3.5 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold appearance-none text-white text-xs"
                        >
                            <option value="Active">🟢 Active</option>
                            <option value="Future">🟡 Future</option>
                            <option value="Retired">🔴 Retired</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-accent-primary uppercase tracking-widest mb-1.5">Optional Notes</label>
                        <textarea 
                            rows={2}
                            value={currentSite.notes} 
                            onChange={e => setCurrentSite({...currentSite, notes: e.target.value})}
                            placeholder="Gate directives, clearance keys..."
                            className="w-full px-3.5 py-2 bg-black/80 border border-accent-primary/30 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium placeholder:text-white/20"
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>
                <div className="p-4 border-t border-white/10 flex flex-wrap justify-end gap-2.5 bg-white/[0.02]">
                    <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-transparent hover:bg-white/[0.05] border border-white/15 text-muted hover:text-white transition-all cursor-pointer" disabled={actionLoading}>Cancel</button>
                    <button 
                        onClick={() => performAction('add', currentSite, true)} 
                        className="px-3 py-1.5 text-xs font-black rounded-lg bg-transparent hover:bg-accent-primary/10 text-accent-primary border border-accent-primary/30 transition-all cursor-pointer"
                        disabled={actionLoading || !currentSite.code.trim()}
                    >
                        Save & Add Another
                    </button>
                    <button 
                        onClick={() => performAction('add', currentSite, false)} 
                        className="px-3 py-1.5 text-xs font-black rounded-lg bg-transparent hover:bg-accent-primary/10 text-accent-primary border border-accent-primary transition-all cursor-pointer"
                        disabled={actionLoading || !currentSite.code.trim()}
                    >
                        Save Record
                    </button>
                </div>
            </div>
        </div>
    );
}
