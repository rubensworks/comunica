import type { FunctionApplication } from '../types';
import type { Expression,
  OperatorExpression } from './Expressions';
import {
  ExpressionType,
} from './Expressions';

export class Operator implements OperatorExpression {
  public expressionType: ExpressionType.Operator = ExpressionType.Operator;

  public constructor(public args: Expression[], public apply: FunctionApplication) { }
}