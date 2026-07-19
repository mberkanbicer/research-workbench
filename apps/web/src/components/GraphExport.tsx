'use client';

import { useCallback, useState } from 'react';
import { toPng, toSvg } from 'html-to-image';

interface GraphExportProps {
  graphRef: React.RefObject<HTMLDivElement>;
  filename: string;
  jsonData?: unknown;
}

export default function GraphExport({ graphRef, filename, jsonData }: GraphExportProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const download = useCallback(
    async (dataUrl: string, ext: string) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.${ext}`;
      a.click();
    },
    [filename],
  );

  const handleExport = useCallback(
    async (format: 'png' | 'svg' | 'json') => {
      if (!graphRef.current) return;
      setExporting(format);
      try {
        if (format === 'json' && jsonData) {
          const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          download(url, 'json');
          URL.revokeObjectURL(url);
        } else if (format === 'png') {
          const dataUrl = await toPng(graphRef.current, {
            quality: 1,
            pixelRatio: 2,
            backgroundColor: '#f9fafb',
          });
          download(dataUrl, 'png');
        } else if (format === 'svg') {
          const dataUrl = await toSvg(graphRef.current, { backgroundColor: '#f9fafb' });
          download(dataUrl, 'svg');
        }
      } catch (err) {
        console.error('Export failed:', err);
      } finally {
        setExporting(null);
      }
    },
    [graphRef, jsonData, download],
  );

  return (
    <div className="relative group">
      <button className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
        Export \u25BE
      </button>
      <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-50 hidden group-hover:block min-w-[140px]">
        <button
          onClick={() => handleExport('png')}
          disabled={!!exporting}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting === 'png' ? 'Exporting...' : 'Export as PNG'}
        </button>
        <button
          onClick={() => handleExport('svg')}
          disabled={!!exporting}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting === 'svg' ? 'Exporting...' : 'Export as SVG'}
        </button>
        {!!jsonData && (
          <button
            onClick={() => handleExport('json')}
            disabled={!!exporting}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === 'json' ? 'Exporting...' : 'Export as JSON'}
          </button>
        )}
      </div>
    </div>
  );
}
