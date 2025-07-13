import { VisualResponse, VisualItem, ColumnDef, RowData, ActionButton } from '../types';

/**
 * VisualResponseRenderer - Renders VisualResponse objects into HTML elements
 */
export class VisualResponseRenderer {
  private container: HTMLElement;
  private theme: 'light' | 'dark' = 'light';
  private customStyles: Record<string, string> = {};

  constructor(container: HTMLElement, theme: 'light' | 'dark' = 'light') {
    this.container = container;
    this.theme = theme;
    this.initializeStyles();
  }

  /**
   * Set theme for the renderer
   */
  public setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.container.setAttribute('data-theme', theme);
  }

  /**
   * Set custom styles
   */
  public setCustomStyles(styles: Record<string, string>): void {
    this.customStyles = styles;
    this.applyCustomStyles();
  }

  /**
   * Render a visual response
   */
  public render(visualResponse: VisualResponse): HTMLElement {
    const wrapper = this.createElement('div', 'mcp-visual-response');
    
    switch (visualResponse.type) {
      case 'card':
        return this.renderCard(visualResponse);
      case 'table':
        return this.renderTable(visualResponse);
      case 'detail':
        return this.renderDetail(visualResponse);
      case 'list':
        return this.renderList(visualResponse);
      default:
        return this.renderFallback(visualResponse);
    }
  }

  /**
   * Render multiple visual responses
   */
  public renderMultiple(visualResponses: VisualResponse[]): HTMLElement {
    const wrapper = this.createElement('div', 'mcp-visual-responses');
    
    visualResponses.forEach(response => {
      const element = this.render(response);
      wrapper.appendChild(element);
    });

    return wrapper;
  }

  /**
   * Render card layout
   */
  private renderCard(response: VisualResponse): HTMLElement {
    const card = this.createElement('div', 'mcp-card');

    if (response.items) {
      response.items.forEach(item => {
        const cardItem = this.renderCardItem(item);
        card.appendChild(cardItem);
      });
    }

    return card;
  }

  /**
   * Render individual card item
   */
  private renderCardItem(item: VisualItem): HTMLElement {
    const cardItem = this.createElement('div', 'mcp-card-item');

    // Header
    if (item.title || item.subtitle) {
      const header = this.createElement('div', 'mcp-card-header');
      
      if (item.title) {
        const title = this.createElement('h3', 'mcp-card-title', item.title);
        header.appendChild(title);
      }
      
      if (item.subtitle) {
        const subtitle = this.createElement('p', 'mcp-card-subtitle', item.subtitle);
        header.appendChild(subtitle);
      }
      
      cardItem.appendChild(header);
    }

    // Image
    if (item.image) {
      const img = this.createElement('img', 'mcp-card-image') as HTMLImageElement;
      img.src = item.image;
      img.alt = item.title || 'Card image';
      cardItem.appendChild(img);
    }

    // Description
    if (item.description) {
      const description = this.createElement('p', 'mcp-card-description', item.description);
      cardItem.appendChild(description);
    }

    // Fields
    if (item.fields) {
      const fieldsContainer = this.createElement('div', 'mcp-card-fields');
      Object.entries(item.fields).forEach(([key, value]) => {
        const field = this.createElement('div', 'mcp-card-field');
        const label = this.createElement('span', 'mcp-card-field-label', key + ':');
        const valueEl = this.createElement('span', 'mcp-card-field-value', String(value));
        field.appendChild(label);
        field.appendChild(valueEl);
        fieldsContainer.appendChild(field);
      });
      cardItem.appendChild(fieldsContainer);
    }

    // Actions
    if (item.actions) {
      const actionsContainer = this.createElement('div', 'mcp-card-actions');
      item.actions.forEach(action => {
        const button = this.renderActionButton(action);
        actionsContainer.appendChild(button);
      });
      cardItem.appendChild(actionsContainer);
    }

    return cardItem;
  }

  /**
   * Render table layout
   */
  private renderTable(response: VisualResponse): HTMLElement {
    const tableContainer = this.createElement('div', 'mcp-table-container');
    const table = this.createElement('table', 'mcp-table');

    // Headers
    if (response.columns) {
      const thead = this.createElement('thead');
      const headerRow = this.createElement('tr');
      
      response.columns.forEach(column => {
        const th = this.createElement('th', 'mcp-table-header', column.title);
        if (column.sortable) {
          th.classList.add('mcp-table-sortable');
          th.addEventListener('click', () => this.handleSort(column.key));
        }
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
    }

    // Body
    if (response.rows) {
      const tbody = this.createElement('tbody');
      
      response.rows.forEach(row => {
        const tr = this.createElement('tr');
        
        if (response.columns) {
          response.columns.forEach(column => {
            const td = this.createElement('td', 'mcp-table-cell');
            const cellValue = row[column.key];
            td.appendChild(this.renderCellValue(cellValue, column.type));
            tr.appendChild(td);
          });
        }
        
        tbody.appendChild(tr);
      });
      
      table.appendChild(tbody);
    }

    tableContainer.appendChild(table);
    return tableContainer;
  }

  /**
   * Render detail layout
   */
  private renderDetail(response: VisualResponse): HTMLElement {
    const detail = this.createElement('div', 'mcp-detail');

    if (response.items) {
      response.items.forEach(item => {
        if (item.fields) {
          Object.entries(item.fields).forEach(([key, value]) => {
            const row = this.createElement('div', 'mcp-detail-row');
            const label = this.createElement('div', 'mcp-detail-label', key);
            const valueEl = this.createElement('div', 'mcp-detail-value', String(value));
            row.appendChild(label);
            row.appendChild(valueEl);
            detail.appendChild(row);
          });
        }
      });
    }

    return detail;
  }

  /**
   * Render list layout
   */
  private renderList(response: VisualResponse): HTMLElement {
    const list = this.createElement('ul', 'mcp-list');

    if (response.items) {
      response.items.forEach(item => {
        const listItem = this.createElement('li', 'mcp-list-item');
        
        if (item.title) {
          const title = this.createElement('span', 'mcp-list-title', item.title);
          listItem.appendChild(title);
        }
        
        if (item.description) {
          const description = this.createElement('span', 'mcp-list-description', item.description);
          listItem.appendChild(description);
        }
        
        list.appendChild(listItem);
      });
    }

    return list;
  }

  /**
   * Render fallback for unknown types
   */
  private renderFallback(response: VisualResponse): HTMLElement {
    const fallback = this.createElement('div', 'mcp-fallback');
    const content = this.createElement('pre', 'mcp-fallback-content', JSON.stringify(response, null, 2));
    fallback.appendChild(content);
    return fallback;
  }

  /**
   * Render action button
   */
  private renderActionButton(action: ActionButton): HTMLElement {
    const button = this.createElement('button', `mcp-action-button mcp-action-${action.type || 'primary'}`, action.label);
    
    button.addEventListener('click', () => {
      if (action.url) {
        window.open(action.url, '_blank');
      } else if (action.action) {
        this.handleAction(action.action, action.data);
      }
    });

    return button;
  }

  /**
   * Render cell value based on type
   */
  private renderCellValue(value: any, type?: string): HTMLElement {
    const wrapper = this.createElement('span', 'mcp-cell-value');

    switch (type) {
      case 'url':
        if (typeof value === 'string' && value.startsWith('http')) {
          const link = this.createElement('a', 'mcp-link', value) as HTMLAnchorElement;
          link.href = value;
          link.target = '_blank';
          wrapper.appendChild(link);
        } else {
          wrapper.textContent = String(value);
        }
        break;
      case 'image':
        if (typeof value === 'string' && value.startsWith('http')) {
          const img = this.createElement('img', 'mcp-cell-image') as HTMLImageElement;
          img.src = value;
          img.alt = 'Cell image';
          wrapper.appendChild(img);
        } else {
          wrapper.textContent = String(value);
        }
        break;
      case 'boolean':
        wrapper.textContent = value ? '✓' : '✗';
        wrapper.classList.add(value ? 'mcp-boolean-true' : 'mcp-boolean-false');
        break;
      case 'date':
        if (value instanceof Date) {
          wrapper.textContent = value.toLocaleDateString();
        } else {
          wrapper.textContent = String(value);
        }
        break;
      default:
        wrapper.textContent = String(value);
    }

    return wrapper;
  }

  /**
   * Handle sort action
   */
  private handleSort(columnKey: string): void {
    // Emit sort event that can be handled by parent components
    const event = new CustomEvent('mcp-sort', {
      detail: { columnKey },
      bubbles: true
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Handle custom action
   */
  private handleAction(action: string, data?: any): void {
    // Emit action event that can be handled by parent components
    const event = new CustomEvent('mcp-action', {
      detail: { action, data },
      bubbles: true
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Create HTML element with class and content
   */
  private createElement(tag: string, className?: string, textContent?: string): HTMLElement {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (textContent) {
      element.textContent = textContent;
    }
    return element;
  }

  /**
   * Initialize default styles
   */
  private initializeStyles(): void {
    this.container.setAttribute('data-theme', this.theme);
    
    // Add CSS custom properties for theming
    const style = document.createElement('style');
    style.textContent = this.getDefaultCSS();
    document.head.appendChild(style);
  }

  /**
   * Apply custom styles
   */
  private applyCustomStyles(): void {
    Object.entries(this.customStyles).forEach(([property, value]) => {
      this.container.style.setProperty(property, value);
    });
  }

  /**
   * Get default CSS for MCP components
   */
  private getDefaultCSS(): string {
    return `
      .mcp-visual-response {
        margin-bottom: 1rem;
      }

      .mcp-card {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .mcp-card-item {
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
        padding: 1rem;
        background: var(--mcp-surface, #fff);
      }

      .mcp-card-header {
        margin-bottom: 0.5rem;
      }

      .mcp-card-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--mcp-text, #1f2937);
      }

      .mcp-card-subtitle {
        margin: 0.25rem 0 0 0;
        color: var(--mcp-text-secondary, #6b7280);
        font-size: 0.875rem;
      }

      .mcp-card-image {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin-bottom: 0.5rem;
      }

      .mcp-card-description {
        margin: 0.5rem 0;
        color: var(--mcp-text, #1f2937);
        line-height: 1.5;
      }

      .mcp-card-fields {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0.5rem 0;
      }

      .mcp-card-field {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .mcp-card-field-label {
        font-weight: 500;
        color: var(--mcp-text-secondary, #6b7280);
      }

      .mcp-card-field-value {
        color: var(--mcp-text, #1f2937);
      }

      .mcp-card-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
      }

      .mcp-table-container {
        overflow-x: auto;
        border-radius: 8px;
        border: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--mcp-surface, #fff);
      }

      .mcp-table-header {
        background: var(--mcp-bg, #f9fafb);
        padding: 0.75rem;
        text-align: left;
        font-weight: 600;
        color: var(--mcp-text, #1f2937);
        border-bottom: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-table-sortable {
        cursor: pointer;
        user-select: none;
      }

      .mcp-table-sortable:hover {
        background: var(--mcp-border, #e1e5e9);
      }

      .mcp-table-cell {
        padding: 0.75rem;
        border-bottom: 1px solid var(--mcp-border, #e1e5e9);
        color: var(--mcp-text, #1f2937);
      }

      .mcp-detail {
        background: var(--mcp-surface, #fff);
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
        padding: 1rem;
      }

      .mcp-detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-detail-row:last-child {
        border-bottom: none;
      }

      .mcp-detail-label {
        font-weight: 500;
        color: var(--mcp-text-secondary, #6b7280);
      }

      .mcp-detail-value {
        color: var(--mcp-text, #1f2937);
      }

      .mcp-list {
        list-style: none;
        padding: 0;
        margin: 0;
        background: var(--mcp-surface, #fff);
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
      }

      .mcp-list-item {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--mcp-border, #e1e5e9);
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .mcp-list-item:last-child {
        border-bottom: none;
      }

      .mcp-list-title {
        font-weight: 500;
        color: var(--mcp-text, #1f2937);
      }

      .mcp-list-description {
        color: var(--mcp-text-secondary, #6b7280);
        font-size: 0.875rem;
      }

      .mcp-action-button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .mcp-action-primary {
        background: var(--mcp-primary, #3b82f6);
        color: white;
      }

      .mcp-action-primary:hover {
        background: var(--mcp-primary-hover, #2563eb);
      }

      .mcp-action-secondary {
        background: var(--mcp-surface, #fff);
        color: var(--mcp-text, #1f2937);
        border: 1px solid var(--mcp-border, #e1e5e9);
      }

      .mcp-action-secondary:hover {
        background: var(--mcp-bg, #f9fafb);
      }

      .mcp-action-danger {
        background: var(--mcp-error, #ef4444);
        color: white;
      }

      .mcp-action-danger:hover {
        background: var(--mcp-error-hover, #dc2626);
      }

      .mcp-link {
        color: var(--mcp-primary, #3b82f6);
        text-decoration: none;
      }

      .mcp-link:hover {
        text-decoration: underline;
      }

      .mcp-cell-image {
        max-width: 50px;
        max-height: 50px;
        object-fit: cover;
        border-radius: 4px;
      }

      .mcp-boolean-true {
        color: var(--mcp-success, #10b981);
      }

      .mcp-boolean-false {
        color: var(--mcp-error, #ef4444);
      }

      .mcp-fallback {
        background: var(--mcp-bg, #f9fafb);
        border: 1px solid var(--mcp-border, #e1e5e9);
        border-radius: 8px;
        padding: 1rem;
      }

      .mcp-fallback-content {
        margin: 0;
        font-family: monospace;
        font-size: 0.875rem;
        color: var(--mcp-text, #1f2937);
        overflow-x: auto;
      }

      /* Dark theme overrides */
      [data-theme="dark"] {
        --mcp-bg: #111827;
        --mcp-surface: #1f2937;
        --mcp-text: #f9fafb;
        --mcp-text-secondary: #9ca3af;
        --mcp-border: #374151;
        --mcp-primary: #60a5fa;
        --mcp-primary-hover: #3b82f6;
        --mcp-success: #34d399;
        --mcp-error: #f87171;
        --mcp-error-hover: #ef4444;
      }
    `;
  }
}