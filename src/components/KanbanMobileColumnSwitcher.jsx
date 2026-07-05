import React from 'react'

export default function KanbanMobileColumnSwitcher({
  columns,
  activeColumnIndex,
  onColumnChange,
}) {
  if (!columns || columns.length === 0) return null

  return (
    <div className="kanban-mobile-switcher">
      {/* Column name + nav arrows */}
      <div className="kanban-mobile-header">
        <button
          className="kanban-mobile-arrow kanban-mobile-arrow-left"
          onClick={() => onColumnChange(Math.max(0, activeColumnIndex - 1))}
          disabled={activeColumnIndex === 0}
          aria-label="Previous column"
        >
          ‹
        </button>

        <span className="kanban-mobile-column-name">
          {columns[activeColumnIndex]?.name}
        </span>
        <span className="kanban-mobile-column-count">
          ({columns[activeColumnIndex]?.jobCount || 0})
        </span>

        <button
          className="kanban-mobile-arrow kanban-mobile-arrow-right"
          onClick={() => onColumnChange(Math.min(columns.length - 1, activeColumnIndex + 1))}
          disabled={activeColumnIndex === columns.length - 1}
          aria-label="Next column"
        >
          ›
        </button>
      </div>

      {/* Column dots (pagination indicator + navigation) */}
      <div className="kanban-mobile-dots">
        {columns.map((col, idx) => (
          <button
            key={col.name}
            className={`kanban-mobile-dot${idx === activeColumnIndex ? ' kanban-mobile-dot-active' : ''}`}
            onClick={() => onColumnChange(idx)}
            aria-label={`Go to ${col.name}`}
            aria-current={idx === activeColumnIndex ? 'page' : undefined}
          />
        ))}
      </div>
    </div>
  )
}
