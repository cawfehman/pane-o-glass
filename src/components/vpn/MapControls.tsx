import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFocusUS: () => void;
    onReset: () => void;
}

export function MapControls({ onZoomIn, onZoomOut, onFocusUS, onReset }: MapControlsProps) {
    return (
        <div className="absolute right-4 top-4 flex flex-col gap-2 z-20">
            <button onClick={onZoomIn} className="btn-primary p-2 rounded-md border border-border-color cursor-pointer flex items-center justify-center">
                <ZoomIn size={16} />
            </button>
            <button onClick={onZoomOut} className="btn-primary p-2 rounded-md border border-border-color cursor-pointer flex items-center justify-center">
                <ZoomOut size={16} />
            </button>
            <button onClick={onFocusUS} className="btn-primary px-3 py-2 rounded-md border border-border-color cursor-pointer text-xs font-bold">
                Focus US
            </button>
            <button onClick={onReset} className="btn-primary p-2 rounded-md border border-border-color cursor-pointer flex items-center justify-center">
                <RotateCcw size={16} />
            </button>
        </div>
    );
}
