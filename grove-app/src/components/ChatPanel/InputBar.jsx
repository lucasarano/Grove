import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, Stop, Warning, Image, X } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { useAuth, formatTokenLimitResetHint } from '../../context/AuthContext';
import { nanoid } from 'nanoid';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES = 5;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const [meta, base64] = dataUrl.split(',');
      const mediaType = meta.replace('data:', '').replace(';base64', '');
      resolve({ mediaType, base64, previewUrl: dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function InputBar() {
  const { sendMessage, isStreaming, abortStreaming, activeLeafId, nodes, keyMode, sessionTokensUsed } = useConversation();
  const { isLoggedIn, tokensRemaining, isAtTokenLimit, tokenLimit } = useAuth();

  const enforceLimit = isLoggedIn && isAtTokenLimit && keyMode === 'credits';
  const [value, setValue] = useState('');
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [value]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeLeafId]);

  const addImages = useCallback(async (files) => {
    const imageFiles = Array.from(files)
      .filter((f) => ACCEPTED_TYPES.includes(f.type))
      .slice(0, MAX_IMAGES - images.length);
    if (!imageFiles.length) return;
    const read = await Promise.all(imageFiles.map(readFileAsBase64));
    setImages((prev) => [...prev, ...read.map((r) => ({ id: nanoid(6), ...r }))].slice(0, MAX_IMAGES));
  }, [images.length]);

  const removeImage = useCallback((id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const canSend = (value.trim() || images.length > 0) && !isStreaming && !enforceLimit;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    sendMessage(value.trim(), images);
    setValue('');
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, images, canSend, sendMessage]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    if (!enforceLimit) setIsDragging(true);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (enforceLimit) return;
    addImages(e.dataTransfer.files);
  }

  function handleFileChange(e) {
    addImages(e.target.files);
    e.target.value = '';
  }

  const activeNode = activeLeafId && nodes[activeLeafId];
  const isBranchPoint = activeNode && activeNode.children && activeNode.children.length > 0;

  const containerBorderColor = isDragging
    ? 'var(--color-accent)'
    : enforceLimit
    ? 'color-mix(in srgb, var(--color-error) 40%, transparent)'
    : 'var(--color-border-strong)';

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-bg)',
      padding: 'var(--space-3) var(--space-4)',
    }}>
      {enforceLimit && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: 'var(--space-2)',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
          fontSize: '0.8125rem',
          fontWeight: 400,
          color: 'var(--color-error)',
        }}>
          <Warning size={15} weight="fill" style={{ flexShrink: 0 }} />
          {`You've reached your monthly limit of ${tokenLimit.toLocaleString()} tokens on Grove credits. ${formatTokenLimitResetHint()}`}
        </div>
      )}

      {isBranchPoint && !enforceLimit && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: 'var(--space-2)',
          padding: '0.375rem 0.75rem',
          background: 'var(--color-bg-alt)',
          border: '1px solid var(--color-border)',
          fontSize: '0.8125rem',
          fontWeight: 400,
          letterSpacing: '0.04em',
          color: 'var(--color-accent)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-block' }} />
          Branching from: <em style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
            {activeNode.branchLabel || activeNode.content.slice(0, 40)}…
          </em>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          background: isDragging
            ? 'color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))'
            : 'var(--color-surface)',
          border: `1px solid ${containerBorderColor}`,
          padding: '0.75rem 1rem',
          transition: 'border-color 0.15s ease, background 0.15s ease',
          opacity: enforceLimit ? 0.6 : 1,
        }}
        onFocusCapture={(e) => { if (!enforceLimit && !isDragging) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
        onBlurCapture={(e) => { if (!enforceLimit && !isDragging) e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Image previews */}
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}
              >
                <img
                  src={img.previewUrl}
                  alt="attachment"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    border: '1px solid var(--color-border)',
                  }}
                />
                <button
                  onClick={() => removeImage(img.id)}
                  title="Remove image"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={9} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
          {/* Attach image button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={enforceLimit || images.length >= MAX_IMAGES}
            title={images.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              cursor: (enforceLimit || images.length >= MAX_IMAGES) ? 'default' : 'pointer',
              color: (enforceLimit || images.length >= MAX_IMAGES)
                ? 'var(--color-text-tertiary)'
                : 'var(--color-text-secondary)',
              transition: 'color 0.15s ease, border-color 0.15s ease',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!enforceLimit && images.length < MAX_IMAGES) {
                e.currentTarget.style.color = 'var(--color-accent)';
                e.currentTarget.style.borderColor = 'var(--color-accent)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <Image size={14} />
          </button>

          <textarea
            id="chat-input"
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDragging
                ? 'Drop image here…'
                : enforceLimit
                ? 'Token limit reached…'
                : isStreaming
                ? 'Waiting for response…'
                : 'Message Grove…'
            }
            disabled={isStreaming || enforceLimit}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              fontWeight: 300,
              color: 'var(--color-text-primary)',
              lineHeight: 1.6,
              maxHeight: '220px',
              overflow: 'auto',
            }}
          />

          {isStreaming ? (
            <button
              id="stop-btn"
              onClick={abortStreaming}
              style={{
                flexShrink: 0,
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-error)',
                border: 'none',
                cursor: 'pointer',
                color: '#FFFFFF',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              title="Stop generation"
            >
              <Stop size={14} weight="fill" />
            </button>
          ) : (
            <button
              id="send-btn"
              onClick={handleSend}
              disabled={!canSend}
              style={{
                flexShrink: 0,
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: canSend ? 'var(--color-accent)' : 'var(--color-border)',
                border: 'none',
                cursor: canSend ? 'pointer' : 'default',
                color: '#FFFFFF',
                transition: 'background 0.2s ease',
              }}
              title="Send message (Enter)"
            >
              <ArrowUp size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div style={{
        marginTop: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          fontWeight: 400,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.02em',
        }}>
          Enter to send · Shift+Enter for newline · Drag & drop or attach images
        </p>

        {isLoggedIn && keyMode === 'credits' && (
          <p style={{
            margin: 0,
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: enforceLimit
              ? 'var(--color-error)'
              : tokensRemaining < tokenLimit * 0.1
              ? 'var(--color-warning, #f59e0b)'
              : 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {enforceLimit
              ? '0 tokens remaining'
              : `${tokensRemaining.toLocaleString()} / ${tokenLimit.toLocaleString()} tokens remaining`}
          </p>
        )}

        {isLoggedIn && keyMode === 'api-keys' && (
          <p style={{
            margin: 0,
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {sessionTokensUsed > 0
              ? `${sessionTokensUsed.toLocaleString()} tokens used · your API key`
              : 'API usage · your API key'}
          </p>
        )}
      </div>
    </div>
  );
}
