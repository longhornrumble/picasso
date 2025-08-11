/**
 * Component Type Definitions for Picasso Chat Widget
 * 
 * Type definitions for React components, props, and component-specific interfaces
 * Ensures type safety for all component interactions and data flow
 */

import { ReactNode, RefObject } from 'react';
import type { 
  ChatMessage, 
  MessageType, 
  TenantConfig 
} from './api';

import type { SafeHTML, SafeText, ValidTenantHash } from './security';
import type { ActionChip, FileAttachment } from './api';
import type { ActionChipResponse } from './chat-api';

/* ===== BASE COMPONENT TYPES ===== */

/**
 * Base props for all components
 */
export interface BaseComponentProps {
  readonly className?: string;
  readonly id?: string;
  readonly 'data-testid'?: string;
}

/**
 * Props with children
 */
export interface ComponentWithChildren extends BaseComponentProps {
  readonly children?: ReactNode;
}

/* ===== MESSAGE BUBBLE TYPES ===== */

/**
 * Message bubble variant types
 */
export type MessageBubbleVariant = 'user' | 'assistant' | 'system' | 'error';

/**
 * Message bubble size variants
 */
export type MessageBubbleSize = 'small' | 'medium' | 'large';

/**
 * Message bubble props interface
 */
export interface MessageBubbleProps extends BaseComponentProps {
  readonly message: ChatMessage;
  readonly variant?: MessageBubbleVariant;
  readonly size?: MessageBubbleSize;
  readonly showTimestamp?: boolean;
  readonly showAvatar?: boolean;
  readonly isStreaming?: boolean;
  readonly onActionClick?: (action: ActionChip) => void;
  readonly onAttachmentClick?: (attachment: FileAttachment) => void;
  readonly onCopy?: (content: string) => void;
  readonly onRetry?: (messageId: string) => void;
}

/**
 * Message content rendering props
 */
export interface MessageContentProps extends BaseComponentProps {
  readonly content: SafeHTML | SafeText;
  readonly type: MessageType;
  readonly isStreaming?: boolean;
  readonly streamingContent?: string;
}

/**
 * Action chips container props
 */
export interface ActionChipsProps extends BaseComponentProps {
  readonly chips: readonly (ActionChip | ActionChipResponse)[];
  readonly onChipClick: (chip: ActionChip | ActionChipResponse) => void;
  readonly disabled?: boolean;
  readonly variant?: 'horizontal' | 'vertical';
}

/**
 * File attachment display props
 */
export interface AttachmentDisplayProps extends BaseComponentProps {
  readonly attachments: readonly FileAttachment[];
  readonly onAttachmentClick?: (attachment: FileAttachment) => void;
  readonly onAttachmentRemove?: (attachmentId: string) => void;
  readonly maxDisplayCount?: number;
  readonly showPreview?: boolean;
}

/* ===== CHAT WINDOW TYPES ===== */

/**
 * Chat window state
 */
export interface ChatWindowState {
  readonly isMinimized: boolean;
  readonly isFullscreen: boolean;
  readonly isDragging: boolean;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly size: {
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Chat window props
 */
export interface ChatWindowProps extends BaseComponentProps {
  readonly tenantHash: ValidTenantHash;
  readonly config?: TenantConfig;
  readonly initialState?: Partial<ChatWindowState>;
  readonly onStateChange?: (state: ChatWindowState) => void;
  readonly onClose?: () => void;
  readonly onMinimize?: () => void;
  readonly onMaximize?: () => void;
}

/**
 * Chat header props
 */
export interface ChatHeaderProps extends BaseComponentProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly logoUrl?: string;
  readonly onClose?: () => void;
  readonly onMinimize?: () => void;
  readonly onMaximize?: () => void;
  readonly showControls?: boolean;
  readonly isMinimized?: boolean;
}

/**
 * Chat footer props
 */
export interface ChatFooterProps extends BaseComponentProps {
  readonly poweredByText?: string;
  readonly showPoweredBy?: boolean;
  readonly customFooterContent?: ReactNode;
}

/* ===== INPUT TYPES ===== */

/**
 * Input bar state
 */
export interface InputBarState {
  readonly value: string;
  readonly isComposing: boolean;
  readonly attachments: readonly FileAttachment[];
  readonly mentionSuggestions: readonly string[];
  readonly showEmojiPicker: boolean;
}

/**
 * Input bar props
 */
export interface InputBarProps extends BaseComponentProps {
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly maxLength?: number;
  readonly onSend: (message: string, attachments?: readonly FileAttachment[]) => void;
  readonly onAttachFile?: (files: FileList) => void;
  readonly onTyping?: (isTyping: boolean) => void;
  readonly allowAttachments?: boolean;
  readonly allowedFileTypes?: readonly string[];
  readonly maxFileSize?: number;
  readonly showSendButton?: boolean;
  readonly sendOnEnter?: boolean;
}

/**
 * Attachment menu props
 */
export interface AttachmentMenuProps extends BaseComponentProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onFileSelect: (files: FileList) => void;
  readonly allowedTypes?: readonly string[];
  readonly maxFileSize?: number;
  readonly position?: 'top' | 'bottom' | 'left' | 'right';
}

/* ===== MESSAGE LIST TYPES ===== */

/**
 * Message list props
 */
export interface MessageListProps extends BaseComponentProps {
  readonly messages: readonly ChatMessage[];
  readonly isLoading?: boolean;
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
  readonly onMessageAction?: (messageId: string, action: string) => void;
  readonly scrollBehavior?: 'auto' | 'smooth';
  readonly autoScroll?: boolean;
  readonly showTimestamps?: boolean;
  readonly showAvatars?: boolean;
  readonly virtualized?: boolean;
  readonly maxHeight?: number;
}

/**
 * Virtual list item data
 */
export interface VirtualListItemData {
  readonly index: number;
  readonly message: ChatMessage;
  readonly isVisible: boolean;
  readonly height: number;
}

/**
 * Typing indicator props
 */
export interface TypingIndicatorProps extends BaseComponentProps {
  readonly isVisible: boolean;
  readonly userNames?: readonly string[];
  readonly animationDuration?: number;
}

/* ===== ERROR BOUNDARY TYPES ===== */

/**
 * Error boundary state
 */
export interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error?: Error;
  readonly errorInfo?: {
    readonly componentStack: string;
  };
}

/**
 * Error boundary props
 */
export interface ErrorBoundaryProps extends ComponentWithChildren {
  readonly fallback?: ReactNode;
  readonly onError?: (error: Error, errorInfo: { componentStack: string }) => void;
  readonly resetOnPropsChange?: boolean;
  readonly resetKeys?: readonly (string | number)[];
}

/**
 * Error display props
 */
export interface ErrorDisplayProps extends BaseComponentProps {
  readonly error: Error | string;
  readonly onRetry?: () => void;
  readonly onReport?: (error: Error | string) => void;
  readonly showDetails?: boolean;
  readonly variant?: 'inline' | 'fullscreen' | 'notification';
}

/* ===== LOADING STATES ===== */

/**
 * Loading state types
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Loading spinner props
 */
export interface LoadingSpinnerProps extends BaseComponentProps {
  readonly size?: 'small' | 'medium' | 'large';
  readonly color?: string;
  readonly label?: string;
  readonly inline?: boolean;
}

/**
 * Skeleton loader props
 */
export interface SkeletonLoaderProps extends BaseComponentProps {
  readonly width?: number | string;
  readonly height?: number | string;
  readonly variant?: 'text' | 'rectangular' | 'circular';
  readonly animation?: 'pulse' | 'wave' | 'none';
  readonly count?: number;
}

/* ===== WIDGET MOUNTING TYPES ===== */

/**
 * Widget mount options
 */
export interface WidgetMountOptions {
  readonly container: HTMLElement | string;
  readonly tenantHash: ValidTenantHash;
  readonly config?: Partial<TenantConfig>;
  readonly theme?: 'light' | 'dark' | 'auto';
  readonly position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  readonly autoOpen?: boolean;
  readonly openDelay?: number;
  readonly closeOnOutsideClick?: boolean;
  readonly showCloseButton?: boolean;
  readonly resizable?: boolean;
  readonly draggable?: boolean;
}

/**
 * Widget instance interface
 */
export interface WidgetInstance {
  readonly id: string;
  readonly tenantHash: ValidTenantHash;
  readonly container: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  readonly destroy: () => void;
  readonly sendMessage: (message: string) => void;
  readonly isOpen: () => boolean;
  readonly getConfig: () => TenantConfig | null;
  readonly updateConfig: (config: Partial<TenantConfig>) => void;
}

/* ===== THEME TYPES ===== */

/**
 * Theme color palette
 */
export interface ThemeColors {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly error: string;
  readonly warning: string;
  readonly success: string;
  readonly info: string;
}

/**
 * Theme typography
 */
export interface ThemeTypography {
  readonly fontFamily: string;
  readonly fontSizes: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
    readonly xxl: string;
  };
  readonly fontWeights: {
    readonly normal: number;
    readonly medium: number;
    readonly semibold: number;
    readonly bold: number;
  };
  readonly lineHeights: {
    readonly tight: number;
    readonly normal: number;
    readonly relaxed: number;
  };
}

/**
 * Theme spacing
 */
export interface ThemeSpacing {
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly xxl: string;
}

/**
 * Complete theme interface
 */
export interface Theme {
  readonly colors: ThemeColors;
  readonly typography: ThemeTypography;
  readonly spacing: ThemeSpacing;
  readonly borderRadius: string;
  readonly shadows: {
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
  };
  readonly transitions: {
    readonly fast: string;
    readonly normal: string;
    readonly slow: string;
  };
}

/* ===== ACCESSIBILITY TYPES ===== */

/**
 * ARIA attributes for accessibility
 */
export interface AriaAttributes {
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-expanded'?: boolean;
  readonly 'aria-hidden'?: boolean;
  readonly 'aria-live'?: 'off' | 'polite' | 'assertive';
  readonly 'aria-atomic'?: boolean;
  readonly 'role'?: string;
}

/**
 * Focus management props
 */
export interface FocusManagementProps {
  readonly autoFocus?: boolean;
  readonly focusRef?: RefObject<HTMLElement>;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
}

/* ===== EVENT HANDLER TYPES ===== */

/**
 * Message event handlers
 */
export interface MessageEventHandlers {
  readonly onMessageSend?: (message: string, attachments?: readonly FileAttachment[]) => void;
  readonly onMessageReceive?: (message: ChatMessage) => void;
  readonly onMessageEdit?: (messageId: string, newContent: string) => void;
  readonly onMessageDelete?: (messageId: string) => void;
  readonly onMessageCopy?: (messageId: string, content: string) => void;
  readonly onMessageRetry?: (messageId: string) => void;
}

/**
 * Widget event handlers
 */
export interface WidgetEventHandlers {
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
  readonly onMinimize?: () => void;
  readonly onMaximize?: () => void;
  readonly onResize?: (width: number, height: number) => void;
  readonly onMove?: (x: number, y: number) => void;
  readonly onConfigChange?: (config: TenantConfig) => void;
  readonly onError?: (error: Error) => void;
}

/* ===== UTILITY TYPES ===== */

/**
 * Extract props from component type
 */
export type ExtractProps<T> = T extends React.ComponentType<infer P> ? P : never;

/**
 * Make certain properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make certain properties required
 */
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Component ref type
 */
export type ComponentRef<T extends HTMLElement = HTMLElement> = RefObject<T>;

/**
 * Event handler type helper
 */
export type EventHandler<T = Event> = (event: T) => void;