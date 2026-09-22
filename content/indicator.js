/**
 * E-Fill Lightweight In-Page Indicator
 * Displays a non-intrusive floating badge/pill at bottom-right of the form page.
 * Opens the Chrome Side Panel on click.
 */

(function (global) {
  'use strict';

  class PageIndicator {
    constructor() {
      this.container = null;
      this.shadowRoot = null;
      this.dismissed = false;
    }

    render(detectedCount = 0, readyCount = 0) {
      if (this.dismissed || detectedCount === 0) {
        this.remove();
        return;
      }

      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'efill-floating-indicator';
        this.container.style.position = 'fixed';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.zIndex = '2147483647'; // Highest z-index
        this.container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        // Use shadow DOM to prevent host page style bleed
        this.shadowRoot = this.container.attachShadow({ mode: 'open' });
        document.body.appendChild(this.container);
      }

      this.shadowRoot.innerHTML = `
        <style>
          .pill {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #0f172a;
            color: #f8fafc;
            padding: 10px 16px;
            border-radius: 9999px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
            border: 1px solid #334155;
            font-size: 13px;
            font-weight: 500;
            user-select: none;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
            animation: efillSlideIn 0.3s ease-out;
          }
          .pill:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
          }
          @keyframes efillSlideIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .icon-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #2563eb, #38bdf8);
            border-radius: 50%;
            color: white;
            font-size: 12px;
            font-weight: bold;
          }
          .text-content {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
          }
          .title {
            font-size: 13px;
            font-weight: 600;
            color: #ffffff;
          }
          .subtitle {
            font-size: 11px;
            color: #94a3b8;
          }
          .action-btn {
            background: #2563eb;
            color: #ffffff;
            border: none;
            border-radius: 9999px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s ease;
          }
          .action-btn:hover {
            background: #1d4ed8;
          }
          .close-btn {
            background: transparent;
            color: #64748b;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 2px 6px;
            line-height: 1;
            border-radius: 4px;
            transition: color 0.15s;
          }
          .close-btn:hover {
            color: #cbd5e1;
          }
        </style>
        <div class="pill">
          <div class="icon-badge">⚡</div>
          <div class="text-content">
            <span class="title">E-Fill Active</span>
            <span class="subtitle">${detectedCount} fields detected</span>
          </div>
          <button class="action-btn" id="open-btn">Review in Side Panel</button>
          <button class="close-btn" id="close-btn" title="Dismiss">✕</button>
        </div>
      `;

      const openBtn = this.shadowRoot.getElementById('open-btn');
      openBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
        }
      });

      const closeBtn = this.shadowRoot.getElementById('close-btn');
      closeBtn.addEventListener('click', () => {
        this.dismissed = true;
        this.remove();
      });
    }

    remove() {
      if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
      this.container = null;
      this.shadowRoot = null;
    }
  }

  const indicator = new PageIndicator();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PageIndicator, indicator };
  } else {
    global.EFillIndicator = { PageIndicator, indicator };
  }
})(typeof window !== 'undefined' ? window : globalThis);
