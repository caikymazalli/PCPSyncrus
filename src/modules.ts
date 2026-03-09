/**
 * modules.ts — Definições centralizadas dos módulos do sistema.
 * Usadas tanto pelo painel Master quanto pela camada de enforcement.
 */

export const ALL_MODULES = [
  'ordens',
  'planejamento',
  'estoque',
  'qualidade',
  'suprimentos',
  'engenharia',
  'apontamento',
  'importacao',
  'recursos',
] as const

export type ModuleKey = typeof ALL_MODULES[number]

export type AccessLevel = 'allowed' | 'read_only' | 'denied'

export const MODULE_LABELS: Record<ModuleKey, string> = {
  ordens:       'Ordens',
  planejamento: 'Planejamento',
  estoque:      'Estoque',
  qualidade:    'Qualidade',
  suprimentos:  'Suprimentos',
  engenharia:   'Engenharia',
  apontamento:  'Apontamento',
  importacao:   'Importação',
  recursos:     'Recursos',
}
