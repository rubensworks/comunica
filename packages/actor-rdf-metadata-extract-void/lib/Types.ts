export interface IVoidPropertyPartition {
  triples: number;
  distinctSubjects: number;
  distinctObjects: number;
}

export interface IVoidClassPartition {
  entities: number;
  propertyPartitions: Record<string, IVoidPropertyPartition>;
}

export interface IVoidDataset {
  classes: number;
  classPartitions: Record<string, IVoidClassPartition>;
  distinctObjects: number;
  distinctSubjects: number;
  entities: number;
  identifier: string;
  propertyPartitions: Record<string, IVoidPropertyPartition>;
  triples: number;
  uriRegexPattern: RegExp | undefined;
  vocabularies: string[] | undefined;
}
