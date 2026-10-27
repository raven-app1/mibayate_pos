import { describe, expect, it, beforeEach } from 'vitest';
import { dbService } from './supabase';
import { DEFAULT_LABEL_CONFIG } from './labelConfig';

describe('labelTemplates dbService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default initial template when empty', async () => {
    const templates = await dbService.labelTemplates.getAll();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0].name).toContain('40 × 20 mm');
    expect(templates[0].is_default).toBe(true);
    expect(templates[0].config.paperWidth).toBe('72');
  });

  it('saves a new label template to database/cache', async () => {
    const customConfig = {
      ...DEFAULT_LABEL_CONFIG,
      storeName: 'My Special Store',
      labelWidth: '50',
      labelHeight: '30',
    };
    const created = await dbService.labelTemplates.save('My 50x30 Label', customConfig, {
      description: 'Used for large box items',
      is_default: false,
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('My 50x30 Label');
    expect(created.config.labelWidth).toBe('50');

    const all = await dbService.labelTemplates.getAll();
    const found = all.find(t => t.id === created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('My 50x30 Label');
  });

  it('updates an existing template', async () => {
    const created = await dbService.labelTemplates.save('Original Name', DEFAULT_LABEL_CONFIG);
    const updated = await dbService.labelTemplates.save('Updated Name', {
      ...DEFAULT_LABEL_CONFIG,
      labelHeight: '25',
    }, { id: created.id });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Updated Name');

    const all = await dbService.labelTemplates.getAll();
    const found = all.find(t => t.id === created.id);
    expect(found?.name).toBe('Updated Name');
    expect(found?.config.labelHeight).toBe('25');
  });

  it('sets a template as default and unsets others', async () => {
    const t1 = await dbService.labelTemplates.save('Template 1', DEFAULT_LABEL_CONFIG, { is_default: true });
    const t2 = await dbService.labelTemplates.save('Template 2', DEFAULT_LABEL_CONFIG, { is_default: false });

    await dbService.labelTemplates.setDefault(t2.id);

    const all = await dbService.labelTemplates.getAll();
    const foundT1 = all.find(t => t.id === t1.id);
    const foundT2 = all.find(t => t.id === t2.id);

    expect(foundT2?.is_default).toBe(true);
    expect(foundT1?.is_default).toBe(false);
  });

  it('deletes a template', async () => {
    const created = await dbService.labelTemplates.save('To Delete', DEFAULT_LABEL_CONFIG);
    await dbService.labelTemplates.delete(created.id);

    const all = await dbService.labelTemplates.getAll();
    expect(all.find(t => t.id === created.id)).toBeUndefined();
  });
});
