/**
 * Undo/Redo System Composable
 * Provides undo/redo functionality for workflow state management
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';

/**
 * Deep clone utility
 */
function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export interface UndoRedoOptions {
  maxHistorySize?: number;
  enableKeyboardShortcuts?: boolean;
  debounceMs?: number;
}

export interface ActionRecord {
  timestamp: Date;
  description: string;
  state: any;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UndoRedoOptions = {}
) {
  const {
    maxHistorySize = 50,
    enableKeyboardShortcuts = true,
    debounceMs = 300
  } = options;

  // State management
  const past = ref<ActionRecord[]>([]);
  const present = ref<ActionRecord>({
    timestamp: new Date(),
    description: 'Initial state',
    state: cloneDeep(initialState)
  });
  const future = ref<ActionRecord[]>([]);

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Computed properties
  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);
  const historySize = computed(() => past.value.length);
  const currentState = computed(() => present.value.state);

  /**
   * Record a new action
   */
  function recordAction(newState: T, description: string = 'Action') {
    // Clear debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce rapid changes
    debounceTimer = setTimeout(() => {
      const action: ActionRecord = {
        timestamp: new Date(),
        description,
        state: cloneDeep(newState)
      };

      // Add current state to past
      past.value.push(present.value);

      // Limit history size
      if (past.value.length > maxHistorySize) {
        past.value.shift();
      }

      // Update present
      present.value = action;

      // Clear future (new action invalidates redo history)
      future.value = [];

      console.log(`📝 Recorded: ${description} (History: ${past.value.length})`);
    }, debounceMs);
  }

  /**
   * Undo last action
   */
  function undo(): T | null {
    if (!canUndo.value) {
      console.warn('⚠️ Cannot undo: No history available');
      return null;
    }

    const previous = past.value[past.value.length - 1];
    const newPast = past.value.slice(0, -1);

    // Move current to future
    future.value.unshift(present.value);

    // Update state
    past.value = newPast;
    present.value = previous;

    console.log(`↶ Undo: ${present.value.description}`);
    return cloneDeep(present.value.state);
  }

  /**
   * Redo previously undone action
   */
  function redo(): T | null {
    if (!canRedo.value) {
      console.warn('⚠️ Cannot redo: No future actions available');
      return null;
    }

    const next = future.value[0];
    const newFuture = future.value.slice(1);

    // Move current to past
    past.value.push(present.value);

    // Limit history size
    if (past.value.length > maxHistorySize) {
      past.value.shift();
    }

    // Update state
    future.value = newFuture;
    present.value = next;

    console.log(`↷ Redo: ${present.value.description}`);
    return cloneDeep(present.value.state);
  }

  /**
   * Clear all history
   */
  function clearHistory() {
    past.value = [];
    future.value = [];
    console.log('🗑️ History cleared');
  }

  /**
   * Reset to initial state
   */
  function reset() {
    past.value = [];
    future.value = [];
    present.value = {
      timestamp: new Date(),
      description: 'Reset to initial state',
      state: cloneDeep(initialState)
    };
    console.log('🔄 Reset to initial state');
  }

  /**
   * Get action history
   */
  function getHistory(): ActionRecord[] {
    return [
      ...past.value,
      present.value,
      ...future.value.map(f => ({ ...f, isFuture: true }))
    ];
  }

  /**
   * Jump to specific point in history
   */
  function jumpToAction(index: number): T | null {
    const history = [...past.value, present.value];
    
    if (index < 0 || index >= history.length) {
      console.warn('⚠️ Invalid history index');
      return null;
    }

    const target = history[index];
    const newPast = history.slice(0, index);
    const newFuture = history.slice(index + 1).reverse();

    past.value = newPast;
    present.value = target;
    future.value = [...newFuture, ...future.value];

    console.log(`⏭️ Jumped to: ${target.description}`);
    return cloneDeep(target.state);
  }

  /**
   * Keyboard shortcut handler
   */
  function handleKeyPress(event: KeyboardEvent) {
    // Ctrl+Z or Cmd+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      const state = undo();
      if (state) {
        // Emit event for parent to update
        window.dispatchEvent(new CustomEvent('undo', { detail: state }));
      }
    }
    
    // Ctrl+Y or Cmd+Shift+Z for redo
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')
    ) {
      event.preventDefault();
      const state = redo();
      if (state) {
        // Emit event for parent to update
        window.dispatchEvent(new CustomEvent('redo', { detail: state }));
      }
    }
  }

  // Setup keyboard shortcuts
  if (enableKeyboardShortcuts) {
    onMounted(() => {
      document.addEventListener('keydown', handleKeyPress);
      console.log('⌨️ Undo/Redo keyboard shortcuts enabled (Ctrl+Z, Ctrl+Y)');
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeyPress);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    });
  }

  return {
    // State
    currentState,
    canUndo,
    canRedo,
    historySize,
    
    // Actions
    recordAction,
    undo,
    redo,
    clearHistory,
    reset,
    getHistory,
    jumpToAction
  };
}

/**
 * Create undo/redo controls component
 */
export function createUndoRedoControls() {
  return {
    template: `
      <div class="undo-redo-controls flex items-center gap-2">
        <button
          @click="$emit('undo')"
          :disabled="!canUndo"
          class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Undo (Ctrl+Z)"
        >
          <span>↶</span>
          <span>Undo</span>
        </button>
        
        <button
          @click="$emit('redo')"
          :disabled="!canRedo"
          class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Redo (Ctrl+Y)"
        >
          <span>↷</span>
          <span>Redo</span>
        </button>
        
        <div v-if="historySize > 0" class="text-sm text-gray-500 ml-2">
          {{ historySize }} {{ historySize === 1 ? 'action' : 'actions' }}
        </div>
      </div>
    `,
    props: ['canUndo', 'canRedo', 'historySize'],
    emits: ['undo', 'redo']
  };
}
