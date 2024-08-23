import { BindingsFactory } from '@comunica/bindings-factory';
import { Bus } from '@comunica/core';
import { cachifyMetadata, MetadataValidationState } from '@comunica/metadata';
import { DataFactory } from 'rdf-data-factory';
import { Algebra, Factory } from 'sparqlalgebrajs';
import { ActorQueryOperation } from '..';

const DF = new DataFactory();
const AF = new Factory();
const BF = new BindingsFactory(DF);

describe('ActorQueryOperation', () => {
  const bus = new Bus({ name: 'bus' });

  describe('The ActorQueryOperation module', () => {
    it('should be a function', () => {
      expect(ActorQueryOperation).toBeInstanceOf(Function);
    });

    it('should be a ActorQueryOperation constructor', () => {
      expect(new (<any> ActorQueryOperation)({ name: 'actor', bus }))
        .toBeInstanceOf(ActorQueryOperation);
    });

    it('should not be able to create new ActorQueryOperation objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryOperation)();
      }).toThrow(`Class constructor ActorQueryOperation cannot be invoked without 'new'`);
    });
  });

  describe('#getSafeBindings', () => {
    it('should return for bindings', () => {
      expect(() => ActorQueryOperation.getSafeBindings(<any>{ type: 'bindings' })).not.toThrow();
    });

    it('should error for non-bindings', () => {
      expect(() => ActorQueryOperation.getSafeBindings(<any>{ type: 'no-bindings' }))
        .toThrow(`Invalid query output type: Expected 'bindings' but got 'no-bindings'`);
    });
  });

  describe('#getSafeQuads', () => {
    it('should return for quads', () => {
      expect(() => ActorQueryOperation.getSafeQuads(<any>{ type: 'quads' })).not.toThrow();
    });

    it('should error for non-quads', () => {
      expect(() => ActorQueryOperation.getSafeQuads(<any>{ type: 'no-quads' }))
        .toThrow(`Invalid query output type: Expected 'quads' but got 'no-quads'`);
    });
  });

  describe('#getSafeBoolean', () => {
    it('should return for boolean', () => {
      expect(() => ActorQueryOperation.getSafeBoolean(<any>{ type: 'boolean' })).not.toThrow();
    });

    it('should error for non-boolean', () => {
      expect(() => ActorQueryOperation.getSafeBoolean(<any>{ type: 'no-boolean' }))
        .toThrow(`Invalid query output type: Expected 'boolean' but got 'no-boolean'`);
    });
  });

  describe('#cachifyMetadata', () => {
    it('should remember an instance', async() => {
      let counter = 0;
      const cb = jest.fn(async() => ({ state: new MetadataValidationState(), value: counter++ }));
      const cached = cachifyMetadata(<any> cb);
      expect((await cached()).value).toBe(0);
      expect((await cached()).value).toBe(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should handle invalidation', async() => {
      let counter = 0;
      const state = new MetadataValidationState();
      const cb = jest.fn(async() => ({ state, value: counter++ }));
      const cached = cachifyMetadata(<any> cb);
      expect((await cached()).value).toBe(0);
      expect((await cached()).value).toBe(0);
      expect(cb).toHaveBeenCalledTimes(1);

      state.invalidate();
      expect((await cached()).value).toBe(1);
      expect((await cached()).value).toBe(1);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('#validateQueryOutput', () => {
    it('should return for boolean', () => {
      expect(() => ActorQueryOperation.validateQueryOutput(<any>{ type: 'boolean' }, 'boolean')).not.toThrow();
    });

    it('should error for non-boolean', () => {
      expect(() => ActorQueryOperation.validateQueryOutput(<any>{ type: 'no-boolean' }, 'boolean'))
        .toThrow(`Invalid query output type: Expected 'boolean' but got 'no-boolean'`);
    });
  });

  describe('#getOperationSource', () => {
    it('should return undefined for an operation without metadata', () => {
      expect(ActorQueryOperation.getOperationSource(AF.createNop())).toBeUndefined();
    });

    it('should return undefined for an operation with metadata but without source', () => {
      const op = AF.createNop();
      op.metadata = {};
      expect(ActorQueryOperation.getOperationSource(op)).toBeUndefined();
    });

    it('should return for an operation with source', () => {
      const op = AF.createNop();
      op.metadata = { scopedSource: { source: 'abc' }};
      expect(ActorQueryOperation.getOperationSource(op)).toEqual({ source: 'abc' });
    });
  });

  describe('#assignOperationSource', () => {
    it('should set the source for an operation', () => {
      const opIn = AF.createNop();
      const source = <any> 'abc';
      const opOut = ActorQueryOperation.assignOperationSource(opIn, source);
      expect(ActorQueryOperation.getOperationSource(opIn)).toBeUndefined();
      expect(ActorQueryOperation.getOperationSource(opOut)).toBe(source);
    });

    it('should override the source for an operation', () => {
      const opIn = AF.createNop();
      const source1 = <any> 'abc';
      const source2 = <any> 'def';
      const opOut1 = ActorQueryOperation.assignOperationSource(opIn, source1);
      const opOut2 = ActorQueryOperation.assignOperationSource(opOut1, source2);
      expect(ActorQueryOperation.getOperationSource(opIn)).toBeUndefined();
      expect(ActorQueryOperation.getOperationSource(opOut1)).toBe(source1);
      expect(ActorQueryOperation.getOperationSource(opOut2)).toBe(source2);
    });
  });

  describe('#removeOperationSource', () => {
    it('should not modify an operation without source', () => {
      const opIn = AF.createNop();
      ActorQueryOperation.removeOperationSource(opIn);
      expect(opIn).toEqual(AF.createNop());
    });

    it('should modify an operation with source', () => {
      const source1 = <any> 'abc';
      const opIn = ActorQueryOperation.assignOperationSource(AF.createNop(), source1);
      ActorQueryOperation.removeOperationSource(opIn);
      expect(opIn).toEqual(AF.createNop());
    });

    it('should modify an operation with source and other metadata', () => {
      const source1 = <any> 'abc';
      const opIn = ActorQueryOperation.assignOperationSource(AF.createNop(), source1);
      opIn.metadata!.other = true;
      ActorQueryOperation.removeOperationSource(opIn);
      const opOut = AF.createNop();
      opOut.metadata = { other: true };
      expect(opIn).toEqual(opOut);
    });
  });

  describe('#doesShapeAcceptOperation', () => {
    it('should accept equal operations with pattern type', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'pattern',
          pattern: AF.createNop(),
        },
      }, AF.createNop())).toBeTruthy();
    });

    it('should not accept unequal operations with pattern type', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'pattern',
          pattern: AF.createNop(),
        },
      }, AF.createUnion([]))).toBeFalsy();
    });

    it('should accept equal operations with type type', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createNop())).toBeTruthy();
    });

    it('should accept equal operations with type type for project', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'type',
          type: Algebra.types.PROJECT,
        },
      }, AF.createNop())).toBeTruthy();
    });

    it('should not accept unequal operations with type type', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createUnion([]))).toBeFalsy();
    });

    it('should accept valid conjunction', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'conjunction',
        children: [
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
        ],
      }, AF.createNop())).toBeTruthy();
    });

    it('should not accept invalid conjunction', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'conjunction',
        children: [
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.UNION,
            },
          },
        ],
      }, AF.createUnion([]))).toBeFalsy();
    });

    it('should accept valid disjunction', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'disjunction',
        children: [
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
        ],
      }, AF.createNop())).toBeTruthy();
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'disjunction',
        children: [
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.UNION,
            },
          },
        ],
      }, AF.createUnion([]))).toBeTruthy();
    });

    it('should not accept invalid disjunction', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'disjunction',
        children: [
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.NOP,
            },
          },
          {
            type: 'operation',
            operation: {
              operationType: 'type',
              type: Algebra.types.BGP,
            },
          },
        ],
      }, AF.createUnion([]))).toBeFalsy();
    });

    it('should accept valid arity', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'arity',
        child: {
          type: 'operation',
          operation: {
            operationType: 'type',
            type: Algebra.types.NOP,
          },
        },
      }, AF.createNop())).toBeTruthy();
    });

    it('should not accept invalid arity', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'arity',
        child: {
          type: 'operation',
          operation: {
            operationType: 'type',
            type: Algebra.types.NOP,
          },
        },
      }, AF.createUnion([]))).toBeFalsy();
    });

    it('should accept valid joinBindings', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        joinBindings: true,
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createNop(), { joinBindings: true })).toBeTruthy();
    });

    it('should not accept invalid joinBindings', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createNop(), { joinBindings: true })).toBeFalsy();
    });

    it('should accept valid filterBindings', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        filterBindings: true,
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createNop(), { filterBindings: true })).toBeTruthy();
    });

    it('should not accept invalid filterBindings', () => {
      expect(ActorQueryOperation.doesShapeAcceptOperation({
        type: 'operation',
        operation: {
          operationType: 'type',
          type: Algebra.types.NOP,
        },
      }, AF.createNop(), { filterBindings: true })).toBeFalsy();
    });
  });
});
