/**
 * Exemplo de integração do Widget Sync com o store de tasks
 * 
 * Use este código como referência para integrar a sincronização do widget
 * com seu store Zustand
 */

import { useTasksStore } from '@store/useTasksStore';
import WidgetSyncService from '@services/WidgetSyncService';
import { useEffect, useMemo } from 'react';
import { log, warn, error as logError } from '@utils/logger';

/**
 * Hook para sincronizar automaticamente tasks com o widget
 * Adicione este hook em sua screen principal (ex: HomeScreen.tsx)
 * 
 * Exemplo:
 * 
 * function HomeScreen() {
 *   useWidgetTaskSync();
 *   // resto do código...
 * }
 */
export const useWidgetTaskSync = () => {
  const tasksMap = useTasksStore((state) => state.tasks);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  // Sincronizar quando tasks mudam
  useEffect(() => {
    syncTasksToWidget(tasks);

    // Sincronizar a cada 5 minutos
    const interval = setInterval(() => {
      syncTasksToWidget(tasks);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  // Sincronizar ao abrir o app
  useEffect(() => {
    const subscription = require('react-native').AppState.addEventListener(
      'change',
      (state: string) => {
        if (state === 'active') {
          syncTasksToWidget(tasks);
        }
      }
    );

    return () => subscription.remove();
  }, [tasks]);
};

/**
 * Sincronizar tasks para o widget
 * Conta quantas tasks foram completadas por dia
 */
async function syncTasksToWidget(tasks: any[]) {
  try {
    // Filtrar apenas tasks completadas
    const completedTasks = tasks.filter((task) => task.completed);

    // Agrupar por data de conclusão
    const taskData = WidgetSyncService.groupTasksByDate(completedTasks);

    // Enviar para o widget
    await WidgetSyncService.updateWidgetWithTasks(completedTasks);

    log('✅ Widget sincronizado com', Object.keys(taskData).length, 'dias');
  } catch (error) {
    logError('❌ Erro ao sincronizar widget:', error);
  }
}

/**
 * Função auxiliar para testar o widget manualmente
 * Use no seu debug/development
 */
export const debugWidgetSync = async () => {
  const tasks = Object.values(useTasksStore.getState().tasks);

  log('📊 Tasks totais:', tasks.length);
  log('✅ Tasks completadas:', tasks.filter((t) => t.completed).length);

  await syncTasksToWidget(tasks);
};

/**
 * Integração com sincronização ao completar/descumprir uma task
 * 
 * Adicione isto ao seu reducer de tasks:
 * 
 * // Quando uma task é completada/descompleta
 * toggleTaskCompletion: (taskId: ID) => {
 *   set((state) => {
 *     state.tasks[taskId].completed = !state.tasks[taskId].completed;
 *   });
 *   
 *   // Sincronizar widget imediatamente
 *   WidgetSyncService.updateWidgetWithTasks(
 *     Object.values(store.getState().tasks)
 *   );
 * }
 */
