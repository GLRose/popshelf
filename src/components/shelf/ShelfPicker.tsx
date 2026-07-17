import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { useCollection } from '@/store/useCollection';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShelfPicker({ visible, onClose }: Props) {
  const shelves = useCollection((s) => s.shelves);
  const activeShelfId = useCollection((s) => s.activeShelfId);
  const setActiveShelf = useCollection((s) => s.setActiveShelf);
  const createShelf = useCollection((s) => s.createShelf);
  const renameShelf = useCollection((s) => s.renameShelf);
  const removeShelf = useCollection((s) => s.removeShelf);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setDraft(name);
  };

  const commitRename = () => {
    if (editingId) renameShelf(editingId, draft);
    setEditingId(null);
    setDraft('');
  };

  const commitCreate = () => {
    if (newName.trim()) createShelf(newName);
    setNewName('');
    setCreating(false);
  };

  const close = () => {
    setEditingId(null);
    setCreating(false);
    setNewName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Shelves</Text>
          <Pressable onPress={close} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={20} color={T.text} />
          </Pressable>
        </View>

        {shelves.map((shelf) => {
          const active = shelf.id === activeShelfId;
          const editing = shelf.id === editingId;
          return (
            <View key={shelf.id} style={[styles.row, active && styles.rowActive]}>
              {editing ? (
                <>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    style={styles.input}
                    placeholder="Shelf name"
                    placeholderTextColor={T.muted}
                    onSubmitEditing={commitRename}
                    returnKeyType="done"
                  />
                  <Pressable onPress={commitRename} hitSlop={8} style={styles.rowIcon}>
                    <Ionicons name="checkmark" size={20} color="#4CAF6E" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => {
                      setActiveShelf(shelf.id);
                      close();
                    }}
                    accessibilityLabel={`Select ${shelf.name}`}>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={active ? '#4CAF6E' : T.muted}
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {shelf.name}
                      </Text>
                      <Text style={styles.rowCount}>
                        {shelf.figureIds.length}{' '}
                        {shelf.figureIds.length === 1 ? 'figure' : 'figures'}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => startRename(shelf.id, shelf.name)}
                    hitSlop={8}
                    style={styles.rowIcon}
                    accessibilityLabel={`Rename ${shelf.name}`}>
                    <Ionicons name="pencil" size={17} color={T.muted} />
                  </Pressable>
                  {shelves.length > 1 && (
                    <Pressable
                      onPress={() => removeShelf(shelf.id)}
                      hitSlop={8}
                      style={styles.rowIcon}
                      accessibilityLabel={`Delete ${shelf.name}`}>
                      <Ionicons name="trash-outline" size={17} color={T.danger} />
                    </Pressable>
                  )}
                </>
              )}
            </View>
          );
        })}

        {creating ? (
          <View style={[styles.row, styles.newRow]}>
            <Ionicons name="add-circle-outline" size={20} color={T.muted} />
            <TextInput
              value={newName}
              onChangeText={setNewName}
              autoFocus
              style={styles.input}
              placeholder="Shelf name"
              placeholderTextColor={T.muted}
              onSubmitEditing={commitCreate}
              returnKeyType="done"
            />
            <Pressable onPress={commitCreate} hitSlop={8} style={styles.rowIcon}>
              <Ionicons name="checkmark" size={20} color="#4CAF6E" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setCreating(true)}
            style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="add" size={18} color={T.text} />
            <Text style={styles.newBtnText}>New shelf</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 20,
    paddingBottom: 34,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: T.text },
  close: { padding: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  rowActive: { borderColor: '#4CAF6E', backgroundColor: '#F0FAF3' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: T.text },
  rowCount: { fontSize: 12, color: T.muted, marginTop: 1 },
  rowIcon: { padding: 4 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: T.text,
    paddingVertical: 2,
  },
  newRow: { borderStyle: 'dashed' },
  newBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.chip,
  },
  newBtnText: { fontSize: 14, fontWeight: '800', color: T.text },
});
