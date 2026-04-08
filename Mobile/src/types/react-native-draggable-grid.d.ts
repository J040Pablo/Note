import * as React from "react";

declare module "react-native-draggable-grid" {
  export interface IDraggableGridProps<DataType extends { key: string | number }> {
    numColumns: number;
    data: DataType[];
    renderItem: (item: DataType, order: number) => React.ReactElement<any>;
    style?: object;
    itemHeight?: number;
    dragStartAnimation?: object;
    onItemPress?: (item: DataType) => void;
    onItemLongPress?: (item: DataType) => void;
    onDragItemActive?: (item: DataType) => void;
    onDragStart?: (item: DataType) => void;
    onDragging?: (gestureState: any) => void;
    onDragRelease?: (newSortedData: DataType[]) => void;
    onResetSort?: (newSortedData: DataType[]) => void;
    delayLongPress?: number;
    disabled?: boolean;
  }

  export function DraggableGrid<DataType extends { key: string | number }>(
    props: IDraggableGridProps<DataType>
  ): React.ReactElement<any>;

  export default DraggableGrid;
}
