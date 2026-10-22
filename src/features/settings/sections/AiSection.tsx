import { Eye, EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { OptionGroup } from '@/components/ui/option-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { AI_PROVIDERS, aiProviderLabel, KEY_PLACEHOLDERS, MODEL_HINTS, TASK_GROUP_META } from '@/features/ai/aiConstants';
import { PromptHelpText, type PromptTab } from '@/features/ai/promptHelpText';
import { TaskRoutingSection } from '@/features/ai/TaskRoutingSection';
import { useAiProviderSetup } from '@/features/ai/useAiProviderSetup';
import {
  deleteAiSettings,
  deleteTaskOverride,
  saveAiSettings,
  saveTaskOverride,
  testAiConnection,
  useAiSettings,
} from '@/features/ai/useAiSettings';
import { useDefaultPrompts } from '@/features/ai/useDefaultPrompts';
import { useAiEnabled } from '@/lib/aiToggle';
import { useAuth } from '@/lib/auth';
import { usePlan } from '@/lib/usePlan';
import { cn, getErrorMessage } from '@/lib/utils';
import type { AiTaskGroup } from '@/types';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { SettingsRow } from '../SettingsRow';
import { SettingsSection } from '../SettingsSection';

const UpgradePrompt = __EE__
  ? lazy(() => import('@/ee/UpgradePrompt').then(m => ({ default: m.UpgradePrompt })))
  : (() => null) as React.FC<Record<string, unknown>>;

const PROMPT_TAB_KEYS = ['analysis', 'command', 'query', 'structure', 'reorganization', 'tagSuggestion'] as const;

interface ResettableNumberFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  inputMode: 'numeric' | 'decimal';
  placeholder?: string;
}

function ResettableNumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  inputMode,
  placeholder,
}: ResettableNumberFieldProps) {
  const { t } = useTranslation('settings');
  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('ai.defaultPlaceholder', { defaultValue: 'Default' })}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('ai.resetFieldAriaLabel', { defaultValue: 'Reset {{label}}', label })}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </FormField>
  );
}

const PROMPT_TAB_DEFAULTS: Record<PromptTab, { label: string; shortLabel: string }> = {
  analysis: { label: 'Photo Analysis', shortLabel: 'Photos' },
  command: { label: 'Commands', shortLabel: 'Cmds' },
  query: { label: 'Queries', shortLabel: 'Queries' },
  structure: { label: 'Extraction', shortLabel: 'Extract' },
  reorganization: { label: 'Reorganize', shortLabel: 'Reorg' },
  tagSuggestion: { label: 'Tag Suggestion', shortLabel: 'Tags' },
};

export function AiSection() {
  const { demoMode } = useAuth();
  const { isSelfHosted, planInfo } = usePlan();
  const { aiEnabled, aiGated, setAiEnabled } = useAiEnabled();
  const { t } = useTranslation(['settings', 'ai']);

  const promptTabMeta = PROMPT_TAB_KEYS.map((key) => ({
    key,
    label: t(`ai.promptTabs.${key}.label`, { defaultValue: PROMPT_TAB_DEFAULTS[key].label }),
    shortLabel: t(`ai.promptTabs.${key}.shortLabel`, { defaultValue: PROMPT_TAB_DEFAULTS[key].shortLabel }),
  }));

  // --- AI settings state ---
  const { settings, isLoading: aiLoading, setSettings } = useAiSettings();
  const { prompts: defaultPrompts } = useDefaultPrompts();
  const { showToast } = useToast();

  const setup = useAiProviderSetup({ providerConfigs: settings?.providerConfigs });
  const { setProvider, setApiKey, setModel, setEndpointUrl } = setup;

  const [customPrompt, setCustomPrompt] = useState('');
  const [commandPrompt, setCommandPrompt] = useState('');
  const [queryPrompt, setQueryPrompt] = useState('');
  const [structurePrompt, setStructurePrompt] = useState('');
  const [reorganizationPrompt, setReorganizationPrompt] = useState('');
  const [tagSuggestionPrompt, setTagSuggestionPrompt] = useState('');
  const [activePromptTab, setActivePromptTab] = useState<PromptTab>('analysis');
  const [taskOverrides, setTaskOverrides] = useState<Partial<Record<AiTaskGroup, { provider: string | null; model: string | null; endpointUrl: string | null }>>>({});
  const [temperature, setTemperature] = useState<string>('');
  const [maxTokens, setMaxTokens] = useState<string>('');
  const [topP, setTopP] = useState<string>('');
  const [requestTimeout, setRequestTimeout] = useState<string>('');
  const [testError, setTestError] = useState('');
  const [touched, setTouched] = useState(false);

  // Populate form from loaded settings
  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setApiKey(settings.apiKey);
      setModel(settings.model);
      setEndpointUrl(settings.endpointUrl || '');
      setCustomPrompt(settings.customPrompt || '');
      setCommandPrompt(settings.commandPrompt || '');
      setQueryPrompt(settings.queryPrompt || '');
      setStructurePrompt(settings.structurePrompt || '');
      setReorganizationPrompt(settings.reorganizationPrompt || '');
      setTagSuggestionPrompt(settings.tagSuggestionPrompt || '');
      setTaskOverrides(settings.taskOverrides
        ? Object.fromEntries(
            Object.entries(settings.taskOverrides)
              .filter(([, v]) => v)
              .map(([k, v]) => [k, { provider: v?.provider, model: v?.model, endpointUrl: v?.endpointUrl }])
          )
        : {});
      setTemperature(settings.temperature != null ? String(settings.temperature) : '');
      setMaxTokens(settings.maxTokens != null ? String(settings.maxTokens) : '');
      setTopP(settings.topP != null ? String(settings.topP) : '');
      setRequestTimeout(settings.requestTimeout != null ? String(settings.requestTimeout) : '');
    }
  }, [settings, setProvider, setApiKey, setModel, setEndpointUrl]);

  async function handleTest() {
    setup.setTestResult(null);
    setTestError('');
    try {
      await testAiConnection({
        provider: setup.provider,
        apiKey: setup.apiKey,
        model: setup.model,
        endpointUrl: setup.endpointUrl || undefined,
      });
      setup.setTestResult('success');
    } catch (err) {
      setup.setTestResult('error');
      const base = getErrorMessage(err, t('ai.connectionFailedDefault', { defaultValue: 'Connection failed' }));
      setTestError(
        setup.model
          ? t('ai.connectionFailedWithModel', { defaultValue: '{{base}} (model: {{model}})', base, model: setup.model })
          : base,
      );
    }
  }

  async function handleSave() {
    try {
      const saved = await saveAiSettings({
        provider: setup.provider,
        apiKey: setup.apiKey,
        model: setup.model,
        endpointUrl: setup.endpointUrl || undefined,
        customPrompt: customPrompt.trim() || null,
        commandPrompt: commandPrompt.trim() || null,
        queryPrompt: queryPrompt.trim() || null,
        structurePrompt: structurePrompt.trim() || null,
        reorganizationPrompt: reorganizationPrompt.trim() || null,
        tagSuggestionPrompt: tagSuggestionPrompt.trim() || null,
        temperature: temperature ? Number(temperature) : null,
        maxTokens: maxTokens ? Number(maxTokens) : null,
        topP: topP ? Number(topP) : null,
        requestTimeout: requestTimeout ? Number(requestTimeout) : null,
      });

      // Save task overrides in parallel
      const overrideOps = TASK_GROUP_META.map((g) => g.key)
        .filter((group) => !settings?.taskOverridesEnvLocked?.includes(group))
        .map((group) => {
          const override = taskOverrides[group];
          const original = settings?.taskOverrides?.[group];
          if (override && (override.provider || override.model)) return saveTaskOverride(group, override);
          if (original) return deleteTaskOverride(group);
          return null;
        })
        .filter(Boolean);
      if (overrideOps.length > 0) await Promise.all(overrideOps);

      setSettings(saved);
      showToast({ message: t('ai.settingsSaved', { defaultValue: 'AI settings saved' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('ai.saveFailed', { defaultValue: 'Failed to save' })), variant: 'error' });
    }
  }

  async function handleRemove() {
    try {
      await deleteAiSettings();
      setSettings(null);
      setup.setProvider('openai');
      setup.setApiKey('');
      setup.setModel('');
      setup.setEndpointUrl('');
      setCustomPrompt('');
      setCommandPrompt('');
      setQueryPrompt('');
      setStructurePrompt('');
      setReorganizationPrompt('');
      setTaskOverrides({});
      setTemperature('');
      setMaxTokens('');
      setTopP('');
      setRequestTimeout('');
      setup.setTestResult(null);
      showToast({ message: t('ai.settingsRemoved', { defaultValue: 'AI settings removed' }), variant: 'success' });
    } catch {
      showToast({ message: t('ai.removeFailed', { defaultValue: 'Failed to remove settings' }), variant: 'error' });
    }
  }

  if (aiLoading) return null;

  // Prompt helpers
  const promptMap = {
    analysis:  { value: customPrompt,    set: setCustomPrompt },
    command:   { value: commandPrompt,   set: setCommandPrompt },
    query:     { value: queryPrompt,     set: setQueryPrompt },
    structure: { value: structurePrompt, set: setStructurePrompt },
    reorganization: { value: reorganizationPrompt, set: setReorganizationPrompt },
    tagSuggestion: { value: tagSuggestionPrompt, set: setTagSuggestionPrompt },
  };
  const activePrompt = promptMap[activePromptTab];

  return (
    <>
      <SettingsPageHeader
        title={t('ai.title', { defaultValue: 'AI' })}
        description={t('ai.description', { defaultValue: 'Configure AI provider, models, and prompts.' })}
      />

      {/* AI gating check */}
      {aiGated ? (
        __EE__ && (
          <Suspense fallback={null}>
            <UpgradePrompt
              feature={t('ai.upgradeFeature', { defaultValue: 'AI Features' })}
              description={t('ai.upgradeDescription', { defaultValue: 'Enable AI-powered suggestions and commands.' })}
              upgradeAction={planInfo.upgradeAction}
            />
          </Suspense>
        )
      ) : (
        <>
          {/* AI Features toggle */}
          <SettingsSection label={t('ai.featuresSection', { defaultValue: 'AI Features' })}>
            <SettingsRow
              label={t('ai.featuresLabel', { defaultValue: 'AI Features' })}
              description={t('ai.featuresDesc', { defaultValue: 'Photo analysis, item extraction, and AI commands' })}
              control={
                <Switch
                  id="ai-toggle"
                  checked={aiEnabled}
                  onCheckedChange={setAiEnabled}
                />
              }
              border={false}
            />
          </SettingsSection>

          {/* Provider section — self-hosted only */}
          {isSelfHosted && (
            <div className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
              aiEnabled ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}>
              <div className="overflow-hidden min-h-0 px-1 -mx-1 py-1 -my-1">
                <div className={cn(
                  'transition-opacity duration-200 motion-reduce:transition-none',
                  aiEnabled ? 'opacity-100' : 'opacity-0',
                )}>
                  <SettingsSection
                    label={t('ai.providerSection', { defaultValue: 'Provider' })}
                    description={
                      settings === null && !touched
                        ? t('ai.connectProviderDesc', {
                            defaultValue: 'Connect an AI provider to unlock photo analysis, item extraction from text and voice, and natural language commands for managing your bins.',
                          })
                        : undefined
                    }
                    status={settings?.source === 'env' ? 'info' : undefined}
                    statusMessage={
                      settings?.source === 'env'
                        ? t('ai.envConfiguredMessage', { defaultValue: 'AI is configured by the server. Save your own settings to override.' })
                        : undefined
                    }
                  >
                    <div className="flex flex-col gap-4">
                      <OptionGroup
                        options={AI_PROVIDERS.map((p) => ({ ...p, label: aiProviderLabel(p.key, t) }))}
                        value={setup.provider}
                        onChange={setup.handleProviderChange}
                      />

                      <FormField
                        label={t('ai.apiKeyLabel', { defaultValue: 'API Key' })}
                        htmlFor="ai-api-key"
                        hint={t('ai.apiKeyHint', { defaultValue: 'Stored encrypted. Never sent to OpenBin.' })}
                      >
                        <div className="relative">
                          <Input
                            id="ai-api-key"
                            type={setup.showKey ? 'text' : 'password'}
                            value={setup.apiKey}
                            onChange={(e) => { setup.setApiKey(e.target.value); setup.setTestResult(null); setTouched(true); }}
                            placeholder={KEY_PLACEHOLDERS[setup.provider]}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setup.setShowKey(!setup.showKey)}
                            aria-label={
                              setup.showKey
                                ? t('ai.hideApiKey', { defaultValue: 'Hide API key' })
                                : t('ai.showApiKey', { defaultValue: 'Show API key' })
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                          >
                            {setup.showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormField>

                      <FormField
                        label={t('ai.modelLabel', { defaultValue: 'Model' })}
                        htmlFor="ai-model"
                        hint={t('ai.modelHint', { defaultValue: 'Exact model ID from your provider.' })}
                      >
                        <Input
                          id="ai-model"
                          value={setup.model}
                          onChange={(e) => { setup.setModel(e.target.value); setup.setTestResult(null); setTouched(true); }}
                          placeholder={MODEL_HINTS[setup.provider]}
                        />
                      </FormField>

                      {setup.provider === 'openai-compatible' && (
                        <FormField
                          label={t('ai.endpointLabel', { defaultValue: 'Endpoint URL' })}
                          htmlFor="ai-endpoint"
                          hint={t('ai.endpointHint', { defaultValue: 'For Ollama, LM Studio, and OpenAI-compatible servers.' })}
                        >
                          <Input
                            id="ai-endpoint"
                            value={setup.endpointUrl}
                            onChange={(e) => { setup.setEndpointUrl(e.target.value); setup.setTestResult(null); }}
                            placeholder="http://localhost:11434/v1"
                          />
                        </FormField>
                      )}

                      {touched && !setup.apiKey && !setup.model && (
                        <p className="settings-hint" role="alert">
                          {t('ai.requiredFieldsAlert', { defaultValue: 'API key and model are required.' })}
                        </p>
                      )}
                    </div>
                  </SettingsSection>

                  {/* Task Routing */}
                  {settings && (
                    <SettingsSection label={t('ai.taskRoutingSection', { defaultValue: 'Task Routing' })} dividerAbove>
                      <TaskRoutingSection
                        settings={settings}
                        overrides={taskOverrides}
                        onChange={(group, override) => {
                          setTaskOverrides((prev) => {
                            if (!override) {
                              const { [group]: _, ...rest } = prev;
                              return rest;
                            }
                            return { ...prev, [group]: override };
                          });
                        }}
                        disabled={demoMode}
                      />
                    </SettingsSection>
                  )}

                  {/* Custom Prompts */}
                  <SettingsSection label={t('ai.customPromptsSection', { defaultValue: 'Custom Prompts' })} dividerAbove>
                    <div className="space-y-2">
                      <OptionGroup
                        options={promptTabMeta}
                        value={activePromptTab}
                        onChange={setActivePromptTab}
                        size="sm"
                        renderContent={(opt, active) => (
                          <span className="relative text-center w-full">
                            <span className="sm:hidden">{opt.shortLabel}</span>
                            <span className="hidden sm:inline">{opt.label}</span>
                            {promptMap[opt.key as PromptTab].value.trim() && (
                              <span className={cn('absolute top-1/2 -translate-y-1/2 -right-0.5 h-1.5 w-1.5 rounded-full',
                                active ? 'bg-[var(--text-primary)]' : 'bg-[var(--accent)]'
                              )} />
                            )}
                          </span>
                        )}
                      />
                      {demoMode && (
                        <p className="settings-hint italic">
                          {t('ai.demoPromptsDisabled', { defaultValue: 'Custom prompts are disabled for demo accounts.' })}
                        </p>
                      )}
                      <Textarea
                        value={activePrompt.value || (defaultPrompts?.[activePromptTab] ?? '')}
                        onChange={(e) => {
                          const next = e.target.value;
                          const defaultText = defaultPrompts?.[activePromptTab] ?? '';
                          activePrompt.set(next === defaultText ? '' : next);
                        }}
                        className="font-mono text-[var(--text-sm)] min-h-[200px] resize-y"
                        maxLength={10000}
                        disabled={demoMode}
                      />
                      <div className="row-spread">
                        <p className="settings-hint"><PromptHelpText tab={activePromptTab} t={t} /></p>
                        {!demoMode && activePrompt.value.trim() && (
                          <button
                            type="button"
                            onClick={() => activePrompt.set('')}
                            className="settings-hint flex items-center gap-1 hover:text-[var(--text-secondary)] transition-colors shrink-0 ml-2"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('ai.resetToDefault', { defaultValue: 'Reset to Default' })}
                          </button>
                        )}
                      </div>
                    </div>
                  </SettingsSection>

                  <SettingsSection label={t('ai.advancedSection', { defaultValue: 'Advanced' })} dividerAbove>
                    <div className="flex flex-col gap-3">
                      <ResettableNumberField
                        id="ai-temperature"
                        label={t('ai.temperatureLabel', { defaultValue: 'Temperature' })}
                        hint={t('ai.temperatureHint', { defaultValue: 'Higher = more creative. (0.0–2.0)' })}
                        value={temperature}
                        onChange={setTemperature}
                        min={0}
                        max={2}
                        step={0.1}
                        inputMode="decimal"
                      />
                      <ResettableNumberField
                        id="ai-max-tokens"
                        label={t('ai.maxTokensLabel', { defaultValue: 'Max Tokens' })}
                        hint={t('ai.maxTokensHint', { defaultValue: 'Maximum length of each response. (100–16,000)' })}
                        value={maxTokens}
                        onChange={setMaxTokens}
                        min={100}
                        max={16000}
                        step={100}
                        inputMode="numeric"
                      />
                      <ResettableNumberField
                        id="ai-top-p"
                        label={t('ai.topPLabel', { defaultValue: 'Top P' })}
                        hint={t('ai.topPHint', { defaultValue: 'Nucleus sampling — leave blank if unsure. (0.0–1.0)' })}
                        value={topP}
                        onChange={setTopP}
                        min={0}
                        max={1}
                        step={0.05}
                        inputMode="decimal"
                      />
                      <ResettableNumberField
                        id="ai-timeout"
                        label={t('ai.requestTimeoutLabel', { defaultValue: 'Request Timeout' })}
                        hint={t('ai.requestTimeoutHint', { defaultValue: 'Cancel slow requests after N seconds. Default 30.' })}
                        value={requestTimeout}
                        onChange={setRequestTimeout}
                        min={10}
                        max={300}
                        step={5}
                        inputMode="numeric"
                        placeholder={t('ai.requestTimeoutPlaceholder', { defaultValue: 'Default (30)' })}
                      />
                    </div>
                  </SettingsSection>

                  {setup.testResult === 'success' && (
                    <p className="text-[var(--text-sm)] text-[var(--color-success)] mb-3" aria-live="polite">
                      {t('ai.connectionSuccess', { defaultValue: 'Connected to {{model}} successfully', model: setup.model })}
                    </p>
                  )}
                  {setup.testResult === 'error' && (
                    <p className="text-[var(--text-sm)] text-[var(--destructive)] mb-3" role="alert">{testError}</p>
                  )}

                  {/* Test / Save / Remove buttons */}
                  <div className="flex flex-col gap-3 mb-7">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={handleTest}
                        disabled={setup.testing || !setup.apiKey || !setup.model}
                      >
                        {setup.testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                        {t('ai.testConnection', { defaultValue: 'Test Connection' })}
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={setup.saving || !setup.apiKey || !setup.model}
                      >
                        {setup.saving ? t('ai.saving', { defaultValue: 'Saving...' }) : t('ai.save', { defaultValue: 'Save' })}
                      </Button>
                    </div>
                    {settings && settings.source !== 'env' && (
                      <div className="pt-1 border-t border-[var(--border-flat)]">
                        <Button
                          variant="destructive-ghost"
                          onClick={handleRemove}
                        >
                          {t('ai.removeSettings', { defaultValue: 'Remove AI Settings' })}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </>
  );
}
