import React from 'react';

interface MdFilledButtonProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  disabled?: boolean;
  type?: string;
  href?: string;
  target?: string;
  value?: string;
}

interface MdOutlinedButtonProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  disabled?: boolean;
  type?: string;
  href?: string;
}

interface MdTextButtonProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  disabled?: boolean;
  type?: string;
  href?: string;
}

interface MdElevatedButtonProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  disabled?: boolean;
  type?: string;
}

interface MdIconButtonProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  disabled?: boolean;
  toggle?: boolean;
  selected?: boolean;
  href?: string;
  'aria-label'?: string;
}

interface MdOutlinedTextFieldProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  label?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  rows?: number;
  textarea?: boolean;
  disabled?: boolean;
  error?: boolean;
  errorText?: string;
  supportingText?: string;
  prefixText?: string;
  suffixText?: string;
  oninput?: (e: any) => void;
  onchange?: (e: any) => void;
}

interface MdOutlinedSelectProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  label?: string;
  value?: string;
  disabled?: boolean;
  error?: boolean;
  errorText?: string;
  quick?: boolean;
  oninput?: (e: any) => void;
  onchange?: (e: any) => void;
}

interface MdSelectOptionProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  value?: string;
  selected?: boolean;
  disabled?: boolean;
}

interface MdIconProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  slot?: string;
}

interface MdLinearProgressProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  fourColor?: boolean;
  buffer?: number;
}

interface MdCircularProgressProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  fourColor?: boolean;
}

interface MdFilterChipProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  elevated?: boolean;
}

interface MdAssistChipProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  label?: string;
  disabled?: boolean;
  elevated?: boolean;
  href?: string;
}

interface MdDividerProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  inset?: boolean;
  insetStart?: boolean;
  insetEnd?: boolean;
}

interface MdDialogProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  open?: boolean;
  quick?: boolean;
}

interface MdElevationProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  level?: number | string;
}

interface MdSwitchProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
  selected?: boolean;
  disabled?: boolean;
}

export interface MaterialWebCustomElements {
  'md-filled-button': MdFilledButtonProps;
  'md-outlined-button': MdOutlinedButtonProps;
  'md-text-button': MdTextButtonProps;
  'md-elevated-button': MdElevatedButtonProps;
  'md-icon-button': MdIconButtonProps;
  'md-filled-icon-button': MdIconButtonProps;
  'md-outlined-icon-button': MdIconButtonProps;
  'md-outlined-text-field': MdOutlinedTextFieldProps;
  'md-filled-text-field': MdOutlinedTextFieldProps;
  'md-outlined-select': MdOutlinedSelectProps;
  'md-select-option': MdSelectOptionProps;
  'md-icon': MdIconProps;
  'md-linear-progress': MdLinearProgressProps;
  'md-circular-progress': MdCircularProgressProps;
  'md-chip-set': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  'md-filter-chip': MdFilterChipProps;
  'md-assist-chip': MdAssistChipProps;
  'md-suggestion-chip': MdAssistChipProps;
  'md-divider': MdDividerProps;
  'md-dialog': MdDialogProps;
  'md-elevation': MdElevationProps;
  'md-switch': MdSwitchProps;
  'md-tabs': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  'md-primary-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { selected?: boolean };
  'md-secondary-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { selected?: boolean };
  'md-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  'md-list-item': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string; href?: string };
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends MaterialWebCustomElements {}
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends MaterialWebCustomElements {}
  }
}
