import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog';
import { useGetProductModifiers, useUpdateOrderItemDetails, getGetTableOrderQueryKey, getGetProductModifiersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useScrollGuard } from '../hooks/use-scroll-guard';

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any; // OrderItem
  tableId: string;
}

export function EditItemModal({ isOpen, onClose, item, tableId }: EditItemModalProps) {
  const queryClient = useQueryClient();
  const isDraft = item?.status === 'draft';
  const { onPointerDown, guardLabel } = useScrollGuard();

  const productId = item?.productId || '';
  const { data: modifiersData, isLoading: loadingModifiers } = useGetProductModifiers(productId, {
    query: {
      enabled: isOpen && !!item?.productId,
      queryKey: getGetProductModifiersQueryKey(productId),
    }
  });

  const updateItem = useUpdateOrderItemDetails();

  const [notes, setNotes] = useState(item?.notes || '');
  const [hasAllergy, setHasAllergy] = useState(item?.hasAllergy || false);
  const [allergyNote, setAllergyNote] = useState(item?.allergyNote || '');
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (isOpen && item) {
      setNotes(item.notes || '');
      setHasAllergy(item.hasAllergy || false);
      setAllergyNote(item.allergyNote || '');
      
      const initialMods: Record<string, string | string[]> = {};
      if (item.modifiers && Array.isArray(item.modifiers)) {
        item.modifiers.forEach((m: any) => {
          if (!initialMods[m.groupId]) {
            initialMods[m.groupId] = m.maxSelect === 1 ? m.modifierId : [m.modifierId];
          } else {
            if (Array.isArray(initialMods[m.groupId])) {
              (initialMods[m.groupId] as string[]).push(m.modifierId);
            }
          }
        });
      }
      setSelectedModifiers(initialMods);
    }
  }, [isOpen, item]);

  const handleModifierChange = (groupId: string, modifierId: string, maxSelect: number) => {
    if (!isDraft) return;

    setSelectedModifiers(prev => {
      const current = prev[groupId];
      if (maxSelect === 1) {
        return { ...prev, [groupId]: current === modifierId ? null : modifierId } as any;
      } else {
        const arr = (Array.isArray(current) ? current : []) as string[];
        if (arr.includes(modifierId)) {
          return { ...prev, [groupId]: arr.filter(id => id !== modifierId) };
        } else {
          return { ...prev, [groupId]: [...arr, modifierId] };
        }
      }
    });
  };

  const handleSave = () => {
    if (!item || !isDraft) return;

    const formattedModifiers: any[] = [];
    modifiersData?.forEach(group => {
      const selected = selectedModifiers[group.id];
      if (!selected) return;

      if (Array.isArray(selected)) {
        selected.forEach(modId => {
          const modOption = group.modifiers.find((o) => o.id === modId);
          if (modOption) {
            formattedModifiers.push({
              modifierId: modOption.id,
              modifierName: modOption.name,
              priceDelta: modOption.priceDelta,
            });
          }
        });
      } else {
        const modOption = group.modifiers.find((o) => o.id === selected);
        if (modOption) {
          formattedModifiers.push({
            modifierId: modOption.id,
            modifierName: modOption.name,
            priceDelta: modOption.priceDelta,
          });
        }
      }
    });

    updateItem.mutate({
      itemId: item.id,
      data: {
        notes,
        hasAllergy,
        allergyNote: hasAllergy ? allergyNote : '',
        modifiers: formattedModifiers,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTableOrderQueryKey(tableId) });
        onClose();
      }
    });
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">{item.productName}</DialogTitle>
          {!isDraft && (
            <div className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-md text-sm font-bold uppercase tracking-wider inline-block w-fit mt-2">
              Modo Solo Lectura
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Modifiers */}
          {loadingModifiers ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : modifiersData && modifiersData.length > 0 ? (
            <div className="space-y-4">
              {modifiersData.map((group) => (
                <div key={group.id} className="space-y-2">
                  <h3 className="font-bold text-lg">{group.name} {group.maxSelect === 1 ? '(Elige 1)' : '(Opcional)'}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {group.modifiers.map((opt) => {
                      const isSelected = group.maxSelect === 1 
                        ? selectedModifiers[group.id] === opt.id
                        : (selectedModifiers[group.id] as string[] || []).includes(opt.id);

                      return (
                        <label 
                          key={opt.id} 
                          onPointerDown={onPointerDown}
                          onClick={guardLabel}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border bg-background hover:bg-secondary/50'
                          } ${!isDraft ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type={group.maxSelect === 1 ? "radio" : "checkbox"}
                            name={`group-${group.id}`}
                            checked={isSelected}
                            disabled={!isDraft}
                            onChange={() => handleModifierChange(group.id, opt.id, group.maxSelect)}
                            className="w-4 h-4 accent-primary"
                          />
                          <span className="flex-1 font-semibold">{opt.name}</span>
                          {parseFloat(opt.priceDelta) > 0 && (
                            <span className="text-muted-foreground text-sm">+{opt.priceDelta}€</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Notes */}
          <div className="space-y-2">
            <h3 className="font-bold text-lg">Observaciones</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isDraft}
              placeholder="Sin observaciones..."
              className="w-full bg-background border-2 border-border rounded-xl p-3 min-h-[80px] focus:outline-none focus:border-primary resize-none disabled:opacity-70 disabled:cursor-not-allowed"
            />
          </div>

          {/* Allergy */}
          <div className="space-y-3 bg-red-500/5 border-2 border-red-500/20 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAllergy}
                onChange={(e) => setHasAllergy(e.target.checked)}
                disabled={!isDraft}
                className="w-5 h-5 accent-red-500"
              />
              <span className="font-bold text-lg text-red-500 uppercase tracking-wider">¿Alergia?</span>
            </label>
            {hasAllergy && (
              <input
                type="text"
                value={allergyNote}
                onChange={(e) => setAllergyNote(e.target.value)}
                disabled={!isDraft}
                placeholder="Describe la alergia o requisito especial..."
                className="w-full bg-background border-2 border-red-500/30 rounded-lg p-3 focus:outline-none focus:border-red-500 text-foreground disabled:opacity-70 disabled:cursor-not-allowed"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg font-bold text-muted-foreground hover:bg-secondary transition-colors"
          >
            {isDraft ? 'Cancelar' : 'Cerrar'}
          </button>
          {isDraft && (
            <button
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              {updateItem.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Cambios
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}