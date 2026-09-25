import React from 'react';
import { Network, FolderTree, Building, MapPin, Tag, Trash2, Check, X } from 'lucide-react';

interface SiteModalProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    currentSite: any;
    setCurrentSite: (site: any) => void;
    performAction: (action: 'add' | 'update' | 'delete', siteData: any, addAnother?: boolean) => Promise<boolean>;
    actionLoading: boolean;
    mode?: 'add' | 'edit';
    existingFolders?: string[];
}

export function SiteModal({ 
    isModalOpen, 
    setIsModalOpen, 
    currentSite, 
    setCurrentSite, 
    performAction, 
    actionLoading,
    mode = 'add',
    existingFolders = []
}: SiteModalProps) {
    if (!isModalOpen) return null;

    const isEditMode = mode === 'edit';

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
            <div className="glass-card w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.9)] relative overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200" style={{ maxWidth: '92%', width: '520px' }}>
                {actionLoading && (
                    <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-3 border-accent-primary border-t-transparent animate-spin"></div>
                            <p className="text-xs font-bold text-white">Saving Site Record...</p>
                        </div>
                    </div>
                )}
                <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-accent-primary" />
                        <h3 className="text-sm font-black tracking-tight text-white uppercase">
                            {isEditMode ? `Edit Site: ${currentSite.code}` : "Provision New Site"}
                        </h3>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-white font-bold text-base">&times;</button>
                </div>
                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                    {/* Site Code & Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-accent-primary uppercase tracking-widest mb-1.5">Site Code</label>
                            <input 
                                type="text" 
                                value={currentSite.code || ''} 
                                onChange={e => setCurrentSite({...currentSite, code: e.target.value.toUpperCase()})}
                                placeholder="e.g. LON"
                                disabled={isEditMode}
                                className={`w-full px-3.5 py-2 bg-black/80 border ${isEditMode ? 'border-white/10 text-muted cursor-not-allowed' : 'border-white/20 text-white focus:border-accent-primary'} rounded-xl focus:outline-none focus:ring-1 focus:ring-accent-primary font-black text-xs`}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Descriptive Identity</label>
                            <input 
                                type="text" 
                                value={currentSite.name || ''} 
                                onChange={e => setCurrentSite({...currentSite, name: e.target.value})}
                                placeholder="e.g. Camden Main Complex"
                                className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold text-white text-xs"
                            />
                        </div>
                    </div>

                    {/* Folder / Hierarchy Path */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="flex items-center gap-1.5 text-[10px] font-black text-accent-primary uppercase tracking-widest">
                                <FolderTree className="w-3 h-3" />
                                Hierarchy / Folder Path
                            </label>
                            <span className="text-[10px] text-muted">Use / for nested levels (e.g. Campus/Camden)</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                list="existing-folders-list"
                                value={currentSite.folderPath || ''} 
                                onChange={e => setCurrentSite({...currentSite, folderPath: e.target.value})}
                                placeholder="e.g. Campus/Camden/Acute Care or Ambulatory/South Jersey"
                                className="w-full px-3.5 py-2 bg-black/80 border border-accent-primary/30 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-semibold text-accent-primary text-xs"
                            />
                            {existingFolders.length > 0 && (
                                <datalist id="existing-folders-list">
                                    {existingFolders.map((f, idx) => (
                                        <option key={idx} value={f} />
                                    ))}
                                </datalist>
                            )}
                        </div>
                    </div>

                    {/* Location Type & City */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Location Type</label>
                            <select 
                                value={currentSite.locationType || 'Ambulatory'} 
                                onChange={e => setCurrentSite({...currentSite, locationType: e.target.value})}
                                className="w-full px-3.5 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold appearance-none text-white text-xs"
                            >
                                <option value="Campus">🏛️ Campus</option>
                                <option value="Administrative">🏢 Administrative</option>
                                <option value="Ambulatory">🏥 Ambulatory</option>
                                <option value="Data Center">🖥️ Data Center</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">City</label>
                            <input 
                                type="text" 
                                value={currentSite.city || ''} 
                                onChange={e => setCurrentSite({...currentSite, city: e.target.value})}
                                placeholder="e.g. Camden, Voorhees"
                                className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium"
                            />
                        </div>
                    </div>

                    {/* Hub Designation & Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-white/[0.02]">
                            <input 
                                type="checkbox"
                                id="isHubCheckbox"
                                checked={Boolean(currentSite.isHub)}
                                onChange={e => setCurrentSite({...currentSite, isHub: e.target.checked})}
                                className="w-4 h-4 rounded border-white/20 text-accent-primary focus:ring-accent-primary"
                            />
                            <label htmlFor="isHubCheckbox" className="text-xs font-bold text-white cursor-pointer select-none">
                                Core / Regional Hub
                                <span className="block text-[10px] font-normal text-muted">Hosts core routing / connects satellites</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Lifecycle Status</label>
                            <select 
                                value={currentSite.status || 'Active'} 
                                onChange={e => setCurrentSite({...currentSite, status: e.target.value})}
                                className="w-full px-3.5 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold appearance-none text-white text-xs"
                            >
                                <option value="Active">🟢 Active</option>
                                <option value="Future">🟡 Future</option>
                                <option value="Retired">🔴 Retired</option>
                            </select>
                        </div>
                    </div>

                    {/* Physical Address */}
                    <div>
                        <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Physical Address</label>
                        <textarea 
                            rows={2}
                            value={currentSite.address || ''} 
                            onChange={e => setCurrentSite({...currentSite, address: e.target.value})}
                            placeholder="Street, District, Postal Code"
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium"
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    {/* Optional Notes */}
                    <div>
                        <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Optional Notes</label>
                        <textarea 
                            rows={2}
                            value={currentSite.notes || ''} 
                            onChange={e => setCurrentSite({...currentSite, notes: e.target.value})}
                            placeholder="Fiber entrance notes, rack locations, clearance keys..."
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium placeholder:text-white/20"
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/10 flex flex-wrap justify-between items-center gap-2.5 bg-white/[0.02]">
                    <div>
                        {isEditMode && (
                            <button 
                                type="button"
                                onClick={() => {
                                    if (confirm(`Are you sure you want to delete site ${currentSite.code}?`)) {
                                        performAction('delete', currentSite);
                                        setIsModalOpen(false);
                                    }
                                }} 
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all cursor-pointer flex items-center gap-1.5"
                                disabled={actionLoading}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-transparent hover:bg-white/[0.05] border border-white/15 text-muted hover:text-white transition-all cursor-pointer" disabled={actionLoading}>Cancel</button>
                        {!isEditMode && (
                            <button 
                                onClick={() => performAction('add', currentSite, true)} 
                                className="px-3 py-1.5 text-xs font-black rounded-lg bg-transparent hover:bg-accent-primary/10 text-accent-primary border border-accent-primary/30 transition-all cursor-pointer"
                                disabled={actionLoading || !currentSite.code?.trim()}
                            >
                                Save & Add Another
                            </button>
                        )}
                        <button 
                            onClick={() => performAction(isEditMode ? 'update' : 'add', currentSite, false)} 
                            className="px-3.5 py-1.5 text-xs font-black rounded-lg bg-accent-primary hover:bg-accent-primary/80 text-black border border-accent-primary transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                            disabled={actionLoading || !currentSite.code?.trim()}
                        >
                            <Check className="w-3.5 h-3.5" />
                            {isEditMode ? "Save Changes" : "Provision Site"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
