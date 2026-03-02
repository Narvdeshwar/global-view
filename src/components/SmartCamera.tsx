import React, { useState } from 'react';
import { fetchOsmBounds } from '../lib/osm';

interface SmartCameraProps {
    onLocationFound: (bounds: any) => void;
}

export function SmartCamera({ onLocationFound }: SmartCameraProps) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        const bounds = await fetchOsmBounds(query);
        setLoading(false);

        if (bounds) {
            onLocationFound(bounds);
            setQuery('');
        } else {
            alert('Target not found within India bounds. Please check classification.');
        }
    };

    return (
        <div className="absolute top-4 right-4 z-20 pointer-events-auto bg-black/80 border border-green-500/50 p-4 rounded-md backdrop-blur-sm shadow-xl min-w-[300px]">
            <div className="text-xs text-green-500 font-mono mb-2 uppercase tracking-widest border-b border-green-500/30 pb-2">Target Acquisition</div>
            <form onSubmit={handleSearch} className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ENTER TARGET (e.g. Red Fort)"
                    className="flex-1 bg-transparent border border-green-500/50 text-green-400 font-mono text-sm px-3 py-1 outline-none focus:border-green-400 transition-colors uppercase placeholder:text-green-800"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-green-600/20 hover:bg-green-500/40 border border-green-500/50 text-green-400 font-mono px-3 py-1 text-sm disabled:opacity-50 transition-colors uppercase"
                >
                    {loading ? 'SCNNING...' : 'LOCK ON'}
                </button>
            </form>
        </div>
    );
}
