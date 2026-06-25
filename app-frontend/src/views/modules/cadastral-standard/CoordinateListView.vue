<template>
  <div class="bg-white shadow rounded-lg p-6">
    <div class="mb-6">
      <h2 class="text-xl font-semibold text-gray-900">Coordinate List</h2>
      <p class="text-sm text-gray-600 mt-1">
        Grouped, sorted coordinate list with references and export options.
        <span class="text-blue-600 font-medium">Click any point name to rename it.</span>
      </p>
    </div>

    <!-- Rename error banner -->
    <div v-if="renameError" class="mb-4 bg-red-50 border-l-4 border-red-400 p-3 rounded flex items-center justify-between">
      <span class="text-sm text-red-700">{{ renameError }}</span>
      <button @click="renameError = ''" class="text-red-400 hover:text-red-600 ml-4">✕</button>
    </div>

    <!-- Delete error banner -->
    <div v-if="deleteError" class="mb-4 bg-red-50 border-l-4 border-red-400 p-3 rounded flex items-center justify-between">
      <span class="text-sm text-red-700">{{ deleteError }}</span>
      <button @click="deleteError = ''" class="text-red-400 hover:text-red-600 ml-4">✕</button>
    </div>

    <!-- Control Point Selection Banner (if skipped earlier) -->
    <div v-if="showControlPointReminder" class="mb-6 bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <span class="text-2xl">🔺</span>
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-amber-800">Control Points Not Selected</h3>
          <p class="mt-1 text-sm text-amber-700">
            You skipped control point selection earlier. You can select them now that you know your survey location.
          </p>
          <div class="mt-3">
            <button
              @click="openControlPointSelection"
              class="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 transition-colors"
            >
              🔺 Select Control Points Now
            </button>
          </div>
        </div>
        <button
          @click="dismissControlPointReminder"
          class="ml-3 flex-shrink-0 text-amber-400 hover:text-amber-600"
        >
          <span class="text-xl">✕</span>
        </button>
      </div>
    </div>

    <!-- Export Buttons + Search -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <button @click="exportPDF" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">Export PDF</button>
      <button @click="exportExcel" class="px-4 py-2 text-sm font-medium text-green-600 bg-green-100 rounded hover:bg-green-200">Export Excel</button>
      <button @click="exportWord" class="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-100 rounded hover:bg-indigo-200">Export Word</button>
      <div class="ml-auto flex items-center gap-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search point name or description…"
          class="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span v-if="searchQuery" class="text-xs text-gray-500">
          {{ filteredCoordinateList.length }} / {{ sortedCoordinateList.length }} points
        </span>
      </div>
    </div>
    <!-- Coordinate List Table -->
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">F/B (Obs)</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Calcs</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Point</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Y</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">X</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">F/B</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="filteredCoordinateList.length === 0">
            <td class="px-4 py-6 text-center text-gray-400" colspan="10">
              <span v-if="searchQuery">No points match "{{ searchQuery }}".</span>
              <span v-else>No coordinates to display. Please import or generate points in previous steps.</span>
            </td>
          </tr>
          <tr v-else v-for="point in filteredCoordinateList" :key="point.id"
              :class="{ 'bg-yellow-50': renamingId === point.id }">
            <td class="px-4 py-2">{{ point.group }}</td>
            <td class="px-4 py-2">{{ getObservedFieldBookPage(point.id) }}</td>
            <td class="px-4 py-2">{{ getCalcsPage(point.id) }}</td>
            <!-- Editable point name cell -->
            <td class="px-4 py-2">
              <div v-if="renamingId === point.id" class="flex items-center gap-1">
                <input
                  ref="renameInput"
                  v-model="renameValue"
                  class="border border-blue-400 rounded px-1 py-0.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  @keydown.enter.prevent="commitRename(point.id)"
                  @keydown.escape.prevent="cancelRename"
                  @blur="commitRename(point.id)"
                />
                <span v-if="renameSaving" class="text-xs text-gray-400">saving…</span>
              </div>
              <button
                v-else
                class="text-left font-mono text-sm hover:text-blue-600 hover:underline cursor-pointer focus:outline-none"
                :title="'Click to rename ' + point.id"
                @click="startRename(point.id)"
              >{{ point.id }}</button>
            </td>
            <td class="px-4 py-2">{{ point.coordinates?.y ?? '-' }}</td>
            <td class="px-4 py-2">{{ point.coordinates?.x ?? '-' }}</td>
            <td class="px-4 py-2">{{ point.description }}</td>
            <td class="px-4 py-2">{{ point.status }}</td>
            <td class="px-4 py-2">{{ getFieldBookPage(point.id) }}</td>
            <td class="px-4 py-2">
              <button
                @click="deletePoint(point.id)"
                :disabled="deletingId === point.id"
                class="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete this point"
              >
                {{ deletingId === point.id ? '…' : 'Delete' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import { inject, computed, ref, nextTick } from 'vue';
import { useSurveyLookupStore } from '../../../stores/surveyLookup';
import { renameCoordinatePoint, deleteCoordinatePointByName } from '../../../services/spatial';
import { useCadastralWorkflow } from '../../../composables/useCadastralWorkflow';
export default {
  name: 'CoordinateListView',
  setup() {
    const workflowState = inject('workflowState') as any;
    const lookupStore = useSurveyLookupStore();
    const { projectId } = useCadastralWorkflow();
    
    // Control point reminder state
    const reminderDismissed = ref(false);
    
    // Show reminder if control points were skipped and not dismissed
    const showControlPointReminder = computed(() => {
      if (reminderDismissed.value) return false;
      if (!workflowState?.projectInfo) return false;
      
      // Show if skipped OR if no control points selected
      const skipped = workflowState.projectInfo.controlPointsSkipped === true;
      const noPoints = !workflowState.projectInfo.controlPointIds || 
                       workflowState.projectInfo.controlPointIds.length === 0;
      
      return skipped || noPoints;
    });
    
    function openControlPointSelection() {
      console.log('[CoordinateList] Opening control point selection');
      workflowState.currentStep = 'control-point-selection';
    }
    
    function dismissControlPointReminder() {
      console.log('[CoordinateList] Dismissing control point reminder');
      reminderDismissed.value = true;
    }

    // ── Search / filter state ────────────────────────────────────────────────
    const searchQuery = ref('');

    // ── Delete state ─────────────────────────────────────────────────────────
    const deletingId = ref<string | null>(null);
    const deleteError = ref('');

    async function deletePoint(pointId: string) {
      if (!confirm(`Delete point "${pointId}"? This cannot be undone.`)) return;
      deletingId.value = pointId;
      deleteError.value = '';
      try {
        if (projectId.value) {
          await deleteCoordinatePointByName(projectId.value, pointId);
        }
        // Remove from workflowState.importedPoints
        if (workflowState?.importedPoints) {
          const idx = workflowState.importedPoints.findIndex((p: any) => p.id === pointId);
          if (idx !== -1) workflowState.importedPoints.splice(idx, 1);
        }
        // Remove from coordinateList document if already generated
        if (workflowState?.documents?.coordinateList?.points) {
          const idx = workflowState.documents.coordinateList.points.findIndex((p: any) => p.id === pointId);
          if (idx !== -1) workflowState.documents.coordinateList.points.splice(idx, 1);
        }
        // Remove from adjustedCoordinates if present
        if (workflowState?.adjustedCoordinates) {
          const idx = workflowState.adjustedCoordinates.findIndex((p: any) => p.pointId === pointId);
          if (idx !== -1) workflowState.adjustedCoordinates.splice(idx, 1);
        }
        console.log(`[CoordinateList] Deleted point "${pointId}"`);
      } catch (err: any) {
        deleteError.value = err?.response?.data?.error ||
          err?.message ||
          `Failed to delete "${pointId}".`;
        console.error('[CoordinateList] Delete failed:', err);
      } finally {
        deletingId.value = null;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Inline rename state ──────────────────────────────────────────────────
    const renamingId = ref<string | null>(null);
    const renameValue = ref('');
    const renameSaving = ref(false);
    const renameError = ref('');
    const renameInput = ref<HTMLInputElement | null>(null);

    function startRename(pointId: string) {
      renamingId.value = pointId;
      renameValue.value = pointId;
      renameError.value = '';
      nextTick(() => {
        renameInput.value?.select();
      });
    }

    function cancelRename() {
      renamingId.value = null;
      renameValue.value = '';
    }

    async function commitRename(oldName: string) {
      const newName = renameValue.value.trim();
      // No-op if unchanged or empty
      if (!newName || newName === oldName || renameSaving.value) {
        cancelRename();
        return;
      }
      // Check for duplicate name in current list
      const duplicate = workflowState.importedPoints.find(
        (p: any) => p.id === newName
      );
      if (duplicate) {
        renameError.value = `Point name "${newName}" already exists in this project.`;
        cancelRename();
        return;
      }
      renameSaving.value = true;
      try {
        if (projectId.value) {
          await renameCoordinatePoint(projectId.value, oldName, newName);
        }
        // Update workflowState.importedPoints in-place so all downstream
        // consumers (AreaComputationView, SurveyPlanMapView, PDFs) see the new name
        const point = workflowState.importedPoints.find((p: any) => p.id === oldName);
        if (point) {
          point.id = newName;
        }
        // Also update coordinateList document if already generated
        if (workflowState.documents?.coordinateList?.points) {
          const docPoint = workflowState.documents.coordinateList.points.find(
            (p: any) => p.id === oldName
          );
          if (docPoint) docPoint.id = newName;
        }
        // Update adjustedCoordinates (used by AreaComputationView) if already generated
        if (workflowState.adjustedCoordinates) {
          const adjPoint = workflowState.adjustedCoordinates.find(
            (p: any) => p.pointId === oldName
          );
          if (adjPoint) adjPoint.pointId = newName;
        }
        console.log(`[CoordinateList] ✅ Renamed "${oldName}" → "${newName}"`);
      } catch (err: any) {
        renameError.value = err?.response?.data?.error ||
          err?.message ||
          `Failed to rename "${oldName}".`;
        console.error('[CoordinateList] ❌ Rename failed:', err);
      } finally {
        renameSaving.value = false;
        cancelRename();
      }
    }
    // ────────────────────────────────────────────────────────────────────────
    function getPointGroup(point: any): string {
      const desc = (point.description || '').toLowerCase();
      const status = (point.status || '').toLowerCase();
      if (desc.includes('trig') || desc.includes('town survey mark')) return 'Trig/Town Survey Mark';
      if (status.includes('working station')) return 'Working Station';
      if (status.includes('adopted')) return 'Adopted';
      if (status.includes('found')) return 'Found';
      if (status.includes('placed')) return 'Placed';
      if (status.includes('computed')) return 'Computed';
      return 'Other';
    }
    const sortedCoordinateList = computed(() => {
      // Prefer processed coordinate list from workflowState.documents if available
      if (workflowState?.documents?.coordinateList?.points) {
        return workflowState.documents.coordinateList.points;
      }
      if (!workflowState || !workflowState.importedPoints) return [];
      return [...workflowState.importedPoints].map(point => ({
        ...point,
        group: getPointGroup(point)
      })).sort((a, b) => {
        const groupOrder = [
          'Trig/Town Survey Mark',
          'Working Station',
          'Adopted',
          'Found',
          'Placed',
          'Computed',
          'Other'
        ];
        const groupA = groupOrder.indexOf(a.group);
        const groupB = groupOrder.indexOf(b.group);
        if (groupA !== groupB) return groupA - groupB;
        return a.id.localeCompare(b.id);
      });
    });
    const filteredCoordinateList = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return sortedCoordinateList.value;
      return sortedCoordinateList.value.filter((p: any) =>
        String(p.id ?? '').toLowerCase().includes(q) ||
        String(p.description ?? '').toLowerCase().includes(q)
      );
    });

    function getFieldBookPage(pointId: string) {
      // Use lookup table from Pinia store (generated during PDF creation)
      const fbPage = lookupStore.fieldBookPageLookup[pointId];
      if (fbPage) return fbPage;
      
      // Fallback: check if field book document has page numbers
      if (workflowState?.documents?.fieldBook?.points) {
        const point = workflowState.documents.fieldBook.points.find((p: any) => p.id === pointId);
        if (point?.pageNumber !== undefined) {
          return `E${point.pageNumber}`;
        }
      }
      
      return '-';
    }
    function getCalcsPage(pointId: string) {
      // Calculate page number in Calculations Part 1 PDF
      // The combined points table starts at page 100, with ~35 points per page
      if (!workflowState?.importedPoints) return '-';
      
      const sortedPoints = [...workflowState.importedPoints].sort((a: any, b: any) => 
        a.id?.localeCompare?.(b.id) ?? 0
      );
      
      const pointIndex = sortedPoints.findIndex((p: any) => p.id === pointId);
      if (pointIndex === -1) return '-';
      
      const pointsPerPage = 35;
      const calcsPageNum = 100 + Math.floor(pointIndex / pointsPerPage);
      
      return calcsPageNum.toString();
    }
    function getObservedFieldBookPage(pointId: string) {
      // For points that were observed (not computed)
      // This would reference the field book page where observations were recorded
      // For now, return the same as getFieldBookPage since most points are observed
      return getFieldBookPage(pointId);
    }
    function exportPDF() {
      // PDF export logic with new column order
      // Uses jsPDF (assumed available in project)
      // Columns: Group, F/B (Obs), Calcs, Point, Y, X, Description, Status, F/B
      import('jspdf').then(jsPDFModule => {
        const { jsPDF } = jsPDFModule;
        const doc = new jsPDF({ orientation: 'landscape' });
        const startY = 20;
        const colHeaders = [
          'Group', 'F/B (Obs)', 'Calcs', 'Point', 'Y', 'X', 'Description', 'Status', 'F/B'
        ];
        const colWidths = [28, 28, 20, 28, 32, 32, 60, 22, 28];
        let y = startY;
        let x = 10;
        // Title
        doc.setFontSize(16);
        doc.text('Coordinate List', x, y);
        y += 10;
        doc.setFontSize(10);
        // Header
        let headerX = x;
        colHeaders.forEach((header: string, i: number) => {
          doc.text(header, headerX + 2, y);
          headerX += colWidths[i];
        });
        y += 7;
        // Rows
        (sortedCoordinateList.value as any[]).forEach((point: any) => {
          let rowX = x;
          const row = [
            point.group,
            getObservedFieldBookPage(point.id),
            getCalcsPage(point.id),
            point.id,
            String(point.coordinates?.y ?? '-'),
            String(point.coordinates?.x ?? '-'),
            point.description,
            point.status,
            getFieldBookPage(point.id)
          ];
          row.forEach((cell, i) => {
            doc.text(cell ? String(cell) : '-', rowX + 2, y);
            rowX += colWidths[i];
          });
          y += 7;
          if (y > 190) {
            doc.addPage();
            y = startY + 7;
          }
        });
        doc.save('Coordinate_List.pdf');
      });
    }
    function exportExcel() {
      // Export as CSV for Excel
      const colHeaders = [
        'Group', 'F/B (Obs)', 'Calcs', 'Point', 'Y', 'X', 'Description', 'Status', 'F/B'
      ];
      const rows = (sortedCoordinateList.value as any[]).map((point: any) => [
        point.group,
        getObservedFieldBookPage(point.id),
        getCalcsPage(point.id),
        point.id,
        String(point.coordinates?.y ?? '-'),
        String(point.coordinates?.x ?? '-'),
        point.description,
        point.status,
        getFieldBookPage(point.id)
      ]);
      let csvContent = colHeaders.join(',') + '\n';
      rows.forEach(row => {
        csvContent += row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n';
      });
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Coordinate_List.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    function exportWord() {
      // Export as HTML table for Word
      const colHeaders = [
        'Group', 'F/B (Obs)', 'Calcs', 'Point', 'Y', 'X', 'Description', 'Status', 'F/B'
      ];
      let html = '<table border="1" style="border-collapse:collapse;width:100%;font-family:Arial;font-size:12pt">';
      html += '<thead><tr>' + colHeaders.map(h => `<th style=\"padding:4px;background:#f5f5f5\">${h}</th>`).join('') + '</tr></thead>';
      html += '<tbody>';
      (sortedCoordinateList.value as any[]).forEach((point: any) => {
        html += '<tr>' + [
          point.group,
          getObservedFieldBookPage(point.id),
          getCalcsPage(point.id),
          point.id,
          String(point.coordinates?.y ?? '-'),
          String(point.coordinates?.x ?? '-'),
          point.description,
          point.status,
          getFieldBookPage(point.id)
        ].map(cell => `<td style=\"padding:4px\">${cell ? String(cell) : '-'}</td>`).join('') + '</tr>';
      });
      html += '</tbody></table>';
      const blob = new Blob([html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Coordinate_List.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    return {
      sortedCoordinateList,
      filteredCoordinateList,
      searchQuery,
      deletingId,
      deleteError,
      deletePoint,
      getFieldBookPage,
      getCalcsPage,
      getObservedFieldBookPage,
      exportPDF,
      exportExcel,
      exportWord,
      showControlPointReminder,
      openControlPointSelection,
      dismissControlPointReminder,
      // Inline rename
      renamingId,
      renameValue,
      renameSaving,
      renameError,
      renameInput,
      startRename,
      cancelRename,
      commitRename,
    };
  }
};
</script>

<style scoped>
/* Add any custom styles here */
</style>
