/**
 * @module FsrsExtension
 * @description
 * Built-in community extension embedding the FSRS-4.5 spaced repetition review engine.
 * Registers the flashcard modal host, action rail review launcher, sidebar cards tab,
 * status bar due counter, and card creation slash commands.
 *
 * Fully modular and decoupled from Noether native core: manages its own database tables
 * and cleans up document-associated cards via event listeners.
 *
 * @since 0.2.0
 */

import React, { useState, useEffect } from 'react';
import { Extension } from '@/core/extensions/Extension';
import { ExtensionManifest, McpToolResult } from '@/core/extensions/types';
import { NoetherApp } from '@/core/app/NoetherApp';
import { Brain02Icon } from '@/components/common/Icons';
import { fsrsReadme } from './readme';
import {
  initFsrsTables,
  getDueCards,
  getDueCardCount,
  getAllCards,
  getCardsForDocument,
  updateCardState,
  deleteCardsForDocument,
  syncDocumentCards,
  syncAllVaultCards,
} from './fsrsDb';
import { getSchedulingOptions } from './engine';

const LazyFlashcardsView = React.lazy(() =>
  import('./FlashcardsView').then((m) => ({ default: m.FlashcardsView }))
);
const LazyFsrsSettingsTab = React.lazy(() =>
  import('./FsrsSettingsTab').then((m) => ({ default: m.FsrsSettingsTab }))
);
const LazyStudyReviewModal = React.lazy(() =>
  import('./StudyReviewModal').then((m) => ({ default: m.StudyReviewModal }))
);

export const FSRS_MANIFEST: ExtensionManifest = {
  id: 'noether-fsrs',
  name: 'Spaced Repetition (FSRS)',
  version: '1.1.0',
  description: 'Modern FSRS-4.5 spaced repetition flashcard review engine embedded directly in notes.',
  author: 'Yuliet Li',
  isCore: false,
  tags: ['spaced-repetition', 'fsrs', 'flashcards', 'learning', 'study'],
  readme: fsrsReadme,
};

const FsrsDocCardPill: React.FC<{ docId: string; app: NoetherApp }> = ({ docId, app }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    getCardsForDocument(docId).then((cards) => {
      if (mounted) setCount(cards.length);
    });
    const onUpdated = () => {
      getCardsForDocument(docId).then((cards) => {
        if (mounted) setCount(cards.length);
      });
    };
    window.addEventListener('noether:fsrs-updated', onUpdated);
    window.addEventListener('noether:fsrs-updated', onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('noether:fsrs-updated', onUpdated);
      window.removeEventListener('noether:fsrs-updated', onUpdated);
    };
  }, [docId]);

  if (count <= 0) return null;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        app.events.emit('editor:action', { action: 'open-fsrs-review', documentId: docId });
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review', { detail: { documentId: docId } }));
      }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--noether-btn-hover-bg)] text-[var(--noether-text-primary)] border border-[var(--noether-border-subtle)] cursor-pointer select-none hover:bg-[var(--noether-btn-active-bg)]"
      title={`${count} flashcard${count === 1 ? '' : 's'} in note (click to study)`}
    >
      <Brain02Icon size={11} className="text-pink-500" />
      <span>{count}</span>
    </span>
  );
};

const FsrsDueBadgeItem: React.FC<{ app: NoetherApp }> = ({ app }) => {
  const [dueCount, setDueCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const updateCount = () => {
      getDueCardCount().then((count) => {
        if (isMounted) setDueCount(count);
      });
    };
    updateCount();

    const handleUpdateEvent = () => updateCount();
    window.addEventListener('noether:fsrs-updated', handleUpdateEvent);
    window.addEventListener('focus', handleUpdateEvent);

    const unsubDocSaved = app.events.on('document:saved', handleUpdateEvent);

    // Passive fallback interval: only check every 5 minutes and only if document is visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        updateCount();
      }
    }, 300000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('noether:fsrs-updated', handleUpdateEvent);
      window.removeEventListener('focus', handleUpdateEvent);
      unsubDocSaved.dispose();
    };
  }, [app.events]);

  if (dueCount <= 0) return null;

  return (
    <button
      onClick={() => {
        app.events.emit('editor:action', { action: 'open-fsrs-review' });
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review'));
      }}
      className="flex items-center gap-1 text-[#aaaaaa] hover:text-white cursor-pointer"
      title={`${dueCount} cards due for FSRS review`}
    >
      <Brain02Icon size={12} />
      <span>{dueCount} due</span>
    </button>
  );
};

export class FsrsExtension extends Extension {
  constructor(app: NoetherApp, manifest: ExtensionManifest = FSRS_MANIFEST) {
    super(app, manifest);
  }

  public async onload(): Promise<void> {
    // Initialize FSRS tables on load and perform initial vault synchronization
    await initFsrsTables();
    await syncAllVaultCards();

    // Clean up cards when a document is deleted
    this.onEvent('document:deleted', ({ id }) => {
      deleteCardsForDocument(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('noether:fsrs-updated'));
        window.dispatchEvent(new CustomEvent('noether:fsrs-updated'));
      }
    });

    // Synchronize cards whenever a document is saved
    this.onEvent('document:saved', ({ id }) => {
      syncDocumentCards(id);
    });

    // Synchronize all cards whenever a vault is loaded or switched
    this.onEvent('vault:loaded', () => {
      syncAllVaultCards();
    });

    this.onEvent('vault:changed', () => {
      syncAllVaultCards();
    });

    // 0. Register Study Review Modal dynamically into the global app modal host
    this.registerModal({
      id: 'study-review-modal',
      render: () => (
        <React.Suspense fallback={null}>
          <LazyStudyReviewModal />
        </React.Suspense>
      ),
    });

    // 1. Register Action Rail item
    this.addActionRailIcon(
      'review-flashcards',
      <Brain02Icon size={16} />,
      'Review flashcards (Ctrl+Shift+R)',
      (app) => {
        app.events.emit('editor:action', { action: 'open-fsrs-review' });
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review'));
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review'));
      },
      70
    );

    // 2. Register Right Sidebar Tab
    this.registerSidebarTab({
      id: 'cards',
      title: 'Flashcards in Note',
      icon: <Brain02Icon size={14} />,
      side: 'right',
      order: 50,
      render: () => (
        <React.Suspense fallback={null}>
          <LazyFlashcardsView />
        </React.Suspense>
      ),
    });

    // 3. Register Command
    this.addCommand({
      id: 'cmd-fsrs-review',
      title: 'Review due flashcards (FSRS)',
      section: 'Study',
      icon: <Brain02Icon size={16} />,
      hotkey: 'Ctrl+Shift+R',
      action: (app) => {
        app.events.emit('editor:action', { action: 'open-fsrs-review' });
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review'));
        window.dispatchEvent(new CustomEvent('noether:open-fsrs-review'));
      },
    });

    // 4. Register Status Bar item for due count
    this.addStatusBarItem({
      id: 'fsrs-due-badge',
      alignment: 'right',
      order: 30,
      render: (app) => <FsrsDueBadgeItem app={app} />,
    });

    // 5. Register Flashcard Slash Commands
    this.registerSlashCommand({
      title: 'Concept Flashcard',
      description: 'Insert Concept :: Descriptor inline card',
      icon: 'card',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent('Concept :: Explanation of concept').run();
      },
    });

    this.registerSlashCommand({
      title: 'Two-Way Flashcard',
      description: 'Insert Term ;; Definition bidirectional card',
      icon: 'card',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent('Term ;; Reverse Definition').run();
      },
    });

    this.registerSlashCommand({
      title: 'Cloze Flashcard',
      description: 'Insert Cloze deletion card',
      icon: 'card',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent('The speed of light is {299,792,458 m/s}.').run();
      },
    });

    // 6. Register Extension Settings Tab
    this.registerSettingTab({
      id: 'fsrs-settings',
      name: 'Spaced repetition',
      icon: <Brain02Icon size={14} />,
      render: () => (
        <React.Suspense fallback={null}>
          <LazyFsrsSettingsTab />
        </React.Suspense>
      ),
    });

    // 7. Register Dynamic Placeholder Hint
    this.registerPlaceholderHint({
      id: 'fsrs-card-syntax',
      hint: "'::' for flashcards",
      order: 10,
    });

    // 8. Register Omnibox Search Providers (fsrs: / cards:)
    this.registerSearchProvider({
      id: 'fsrs-cards',
      name: 'Flashcards',
      prefix: 'fsrs:',
      placeholder: 'Search flashcard questions...',
      prefixOnly: true,
      search: async (query) => {
        const q = query.toLowerCase().trim();
        const cards = await getAllCards();
        return cards
          .filter((c) => !q || (c.front && c.front.toLowerCase().includes(q)) || (c.back && c.back.toLowerCase().includes(q)))
          .slice(0, 30)
          .map((c) => ({
            id: `fsrs:card:${c.id}`,
            title: c.front,
            description: `${c.card_type} card · ${c.document_title || 'Document'}`,
            icon: <Brain02Icon size={14} className="text-pink-500" />,
            category: 'Flashcards',
            onSelect: async () => {
              if (c.document_id) {
                await this.app.workspace.openTab(c.document_id);
              }
            },
          }));
      },
    });

    this.registerSearchProvider({
      id: 'fsrs-cards-alias',
      name: 'Flashcards',
      prefix: 'cards:',
      placeholder: 'Search flashcard questions...',
      prefixOnly: true,
      search: (query, ctx) => {
        const p = this.app.omnibox.getProvider('noether-fsrs:fsrs-cards');
        return p ? p.search(query, ctx) : [];
      },
    });

    // 9. Register Tab Context Menu Action
    this.registerTabContextMenuAction({
      id: 'review-note-cards',
      title: 'Review Flashcards in Note',
      icon: <Brain02Icon size={14} />,
      section: 'actions',
      order: 35,
      isVisible: (ctx) => Boolean(ctx.doc),
      onClick: (ctx) => {
        if (ctx.doc) {
          this.app.events.emit('editor:action', { action: 'open-fsrs-review', documentId: ctx.doc.id });
          window.dispatchEvent(new CustomEvent('noether:open-fsrs-review', { detail: { documentId: ctx.doc.id } }));
          window.dispatchEvent(new CustomEvent('noether:open-fsrs-review', { detail: { documentId: ctx.doc.id } }));
        }
      },
    });

    // 10. Register Document Title Decorator
    this.registerDocumentTitleDecorator({
      id: 'fsrs-card-pill',
      matches: (ctx) => Boolean(ctx.doc),
      renderSuffix: (ctx) => {
        if (!ctx.doc) return null;
        return <FsrsDocCardPill docId={ctx.doc.id} app={this.app} />;
      },
    });

    // 11. Register Canvas Custom Card Renderer via EventBus
    this.app.events.emit('canvas:register-card-renderer', {
      id: 'fsrs-flashcard-card',
      matches: (ctx: any) => ctx.node?.type === 'flashcard' || ctx.doc?.doc_type === 'flashcard',
      render: (ctx: any) => (
        <div className="p-3 bg-[var(--noether-bg-card)] border border-[var(--noether-border-subtle)] rounded-lg text-xs font-sans select-none">
          <div className="flex items-center gap-1.5 font-medium text-[var(--noether-text-primary)] mb-1">
            <Brain02Icon size={13} className="text-pink-500" />
            <span>{ctx.node?.title || ctx.doc?.title || 'Flashcard'}</span>
          </div>
          <div className="text-[var(--noether-text-secondary)]">
            {ctx.contentJson || 'Interactive Flashcard'}
          </div>
        </div>
      ),
    });

    // ── MCP Tools Registration ──

    // 12. Tool: fsrs_get_due_cards
    this.registerTool({
      name: 'get_due_cards',
      description: 'Get all flashcards currently due for spaced repetition review, with optional document filter.',
      category: 'study',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'Optional document ID to filter due flashcards belonging to a specific note',
          },
        },
      },
      handler: async (args: Record<string, unknown>, _app: NoetherApp): Promise<McpToolResult> => {
        try {
          const documentId = args.documentId as string | undefined;
          let cards = await getDueCards();
          if (documentId) {
            cards = cards.filter((c) => c.document_id === documentId);
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ cards, total: cards.length }) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          };
        }
      },
    });

    // 9. Tool: fsrs_get_due_count
    this.registerTool({
      name: 'get_due_count',
      description: 'Get the total number of flashcards currently due for review across the entire vault.',
      category: 'study',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async (_args: Record<string, unknown>, _app: NoetherApp): Promise<McpToolResult> => {
        try {
          const count = await getDueCardCount();
          return {
            content: [{ type: 'text', text: JSON.stringify({ dueCount: count }) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          };
        }
      },
    });

    // 10. Tool: fsrs_review_card
    this.registerTool({
      name: 'review_card',
      description: 'Record a study review outcome for a flashcard and advance its FSRS-4.5 spaced repetition state.',
      category: 'study',
      parameters: {
        type: 'object',
        properties: {
          cardId: {
            type: 'string',
            description: 'Unique identifier of the flashcard being reviewed',
          },
          rating: {
            type: 'string',
            description: 'Review outcome rating',
            enum: ['Again', 'Hard', 'Good', 'Easy'],
          },
        },
        required: ['cardId', 'rating'],
      },
      handler: async (args: Record<string, unknown>, _app: NoetherApp): Promise<McpToolResult> => {
        try {
          const cardId = args.cardId as string;
          const rating = args.rating as string;
          if (!cardId || !rating) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'cardId and rating parameters are required' }],
            };
          }

          const allCards = await getAllCards();
          const card = allCards.find((c) => c.id === cardId);
          if (!card) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Flashcard with ID "${cardId}" not found.` }],
            };
          }

          const options = getSchedulingOptions(card, new Date());
          const selectedOption = options.find((opt) => opt.label.toLowerCase() === rating.toLowerCase());
          if (!selectedOption) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Invalid rating "${rating}". Must be one of: Again, Hard, Good, Easy.`,
                },
              ],
            };
          }

          await updateCardState(selectedOption.nextCard);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  cardId,
                  rating: selectedOption.label,
                  interval: selectedOption.intervalText,
                  nextDue: new Date(selectedOption.nextCard.due).toISOString(),
                  card: selectedOption.nextCard,
                }),
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          };
        }
      },
    });

    // 11. Tool: fsrs_get_cards_for_document
    this.registerTool({
      name: 'get_cards_for_document',
      description: 'Retrieve all flashcards created in or associated with a specific note/document.',
      category: 'study',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'Target document identifier',
          },
        },
        required: ['documentId'],
      },
      handler: async (args: Record<string, unknown>, _app: NoetherApp): Promise<McpToolResult> => {
        try {
          const documentId = args.documentId as string;
          if (!documentId) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'documentId parameter is required' }],
            };
          }
          const cards = await getCardsForDocument(documentId);
          return {
            content: [{ type: 'text', text: JSON.stringify({ documentId, cards, total: cards.length }) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          };
        }
      },
    });
  }
}

// Backwards compatibility alias
export const FsrsPlugin = FsrsExtension;
export default FsrsExtension;
