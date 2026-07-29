import React, { useEffect, useId, useRef } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}

const Modal = ({ isOpen, onClose, title, children, footer }: ModalProps) => {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const getFocusableElements = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            (element) => element.getAttribute('aria-hidden') !== 'true',
          )
        : []

    const focusableElements = getFocusableElements()
    ;(focusableElements[0] ?? panel)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panel) return

      const elements = getFocusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 transition-opacity"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative w-full max-w-md rounded-xl bg-white shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="모달 닫기"
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex gap-2 p-4 border-t border-gray-200">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Modal
