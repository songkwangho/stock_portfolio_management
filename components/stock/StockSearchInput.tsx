'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { stockApi } from '@/lib/stockApi';

interface StockSearchResult {
  code: string;
  name: string;
  category?: string;
}

interface StockSearchInputProps {
  placeholder?: string;
  onSelect: (stock: StockSearchResult) => void;
  resetKey?: number;
  className?: string;
}

const StockSearchInput = ({ placeholder = '종목명을 입력하세요 (예: 삼성전자)', onSelect, resetKey, className }: StockSearchInputProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reset input when resetKey changes
  useEffect(() => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  }, [resetKey]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await stockApi.searchStocks(query);
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (stock: StockSearchResult) => {
    setQuery(stock.name);
    setShowDropdown(false);
    setResults([]);
    onSelect(stock);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      <div className="flex items-center bg-surface border border-line-strong rounded-xl px-3 py-2 focus-within:border-ink transition-colors">
        <Search size={14} className="text-faint mr-2 shrink-0" />
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className="bg-transparent border-none focus:outline-none text-sm w-full text-ink placeholder:text-faint"
        />
        {isSearching && <RefreshCw size={12} className="animate-spin text-faint ml-1 shrink-0" />}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 w-full mt-1 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
          {results.map(stock => (
            <button
              key={stock.code}
              onClick={() => handleSelect(stock)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-inset transition-colors border-b border-line last:border-0 text-left"
            >
              <div>
                <p className="text-sm font-bold text-ink">{stock.name}</p>
                <p className="text-xs text-faint tabular-nums">{stock.code}</p>
              </div>
              {stock.category && (
                <span className="text-xs bg-inset text-muted border border-line px-1.5 py-0.5 rounded font-bold shrink-0 ml-2">
                  {stock.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StockSearchInput;
