"use client";

import { Camera, FileText, StickyNote, Trash2 } from "lucide-react";

import { EditorPanel, FadeIn, SegmentedTabsList } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Tabs, TabsContent } from "components/shared/ui/tabs";

import { OCRCapture } from "./talk-form/OCRCapture";
import { TalkForm, TALK_FORM_ID } from "./talk-form/TalkForm";
import { ResourceWarningDialog } from "./ResourceWarningDialog";
import type { TalkFormModalProps } from "./talk-form/types";
import { useTalkForm } from "./talk-form/use-talk-form";

const NEW_TALK_TABS = [
  { value: "form", label: "Formulario", icon: FileText },
  { value: "ocr", label: "OCR", icon: Camera },
];

export function TalkFormModal({
  open,
  onOpenChange,
  openSpaceId,
  note,
  notes,
  rooms,
  roomsData,
  timeSlots,
  onSave,
  onDelete,
  isSaving = false,
}: TalkFormModalProps) {
  const controller = useTalkForm({ open, openSpaceId, note, notes, rooms, roomsData, timeSlots, onSave });
  const isEdit = Boolean(note?.id);

  return (
    <>
      <EditorPanel
        actions={
          <>
            <Button disabled={isSaving} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={isSaving || controller.isProcessingImage || controller.activeTab === "ocr"}
              form={TALK_FORM_ID}
              type="submit"
            >
              {isSaving ? "Guardando…" : "Guardar charla"}
            </Button>
          </>
        }
        busy={isSaving}
        danger={
          // No confirmation: the toast that follows offers "Deshacer".
          onDelete && isEdit ? (
            <Button
              aria-label="Eliminar charla"
              className="h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10"
              disabled={isSaving}
              type="button"
              variant="ghost"
              onClick={onDelete}
            >
              <Trash2 />
              <span className="hidden sm:inline">Eliminar</span>
            </Button>
          ) : undefined
        }
        description={
          isEdit ? "Actualizá la información de la charla." : "Completá el formulario o sacale una foto a la tarjeta."
        }
        icon={StickyNote}
        open={open}
        title={isEdit ? "Editar charla" : "Nueva charla"}
        onOpenChange={onOpenChange}
      >
        <Tabs className="w-full" value={controller.activeTab} onValueChange={controller.setActiveTab}>
          {!isEdit && <SegmentedTabsList className="mb-6" items={NEW_TALK_TABS} value={controller.activeTab} />}

          {!isEdit && (
            <TabsContent className="mt-0" value="ocr">
              <FadeIn>
                <OCRCapture
                  cameraActive={controller.cameraActive}
                  canvasRef={controller.canvasRef}
                  capturedImage={controller.capturedImage}
                  isProcessingImage={controller.isProcessingImage}
                  ocrError={controller.ocrError}
                  permissionMessage={controller.permissionMessage}
                  videoRef={controller.videoRef}
                  onCaptureImage={controller.captureImage}
                  onProcessImage={controller.handleProcessImage}
                  onResetOCR={controller.handleResetOCR}
                  onRetakeImage={controller.retakeImage}
                  onStartCamera={controller.startCamera}
                />
              </FadeIn>
            </TabsContent>
          )}

          <TabsContent className="mt-0" value="form">
            <FadeIn>
              <TalkForm controller={controller} note={note} rooms={rooms} roomsData={roomsData} timeSlots={timeSlots} />
            </FadeIn>
          </TabsContent>
        </Tabs>
      </EditorPanel>

      {/* Shared resource warning (same dialog as the drag-and-drop flow) */}
      <ResourceWarningDialog
        confirmLabel="Guardar igual"
        issues={controller.resourceWarning}
        open={controller.resourceWarning.length > 0}
        onCancel={controller.dismissResourceWarning}
        onConfirm={controller.confirmResourceWarning}
      />
    </>
  );
}
