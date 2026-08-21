/**
 * NE7-SQL - Expression State Evaluation
 * Rewritten from PostgreSQL 18.6 src/backend/executor/execQual.c
 * Implements WHERE clause, AND/OR, comparisons, arithmetic
 */

import { logger } from '../core/logger.js';

export class ExprState {
    constructor(exprTree) {
        this.exprTree = exprTree; // AST node
        logger.debug('ExprState created', { file: 'expr_state.js', line: 10, data: { type: exprTree.type } });
    }

    /**
     * Evaluate expression against a tuple/context
     */
    evaluate(tuple) {
        const result = this.evalNode(this.exprTree, tuple);
        logger.debug('Expression evaluated', { 
            file: 'expr_state.js', 
            line: 17, 
            data: { result, type: this.exprTree.type } 
        });
        return result;
    }

    evalNode(node, tuple) {
        if (!node) return true;

        switch (node.type) {
            case 'BoolExpr':
                return this.evalBoolExpr(node, tuple);
            case 'OpExpr':
                return this.evalOpExpr(node, tuple);
            case 'Var':
                return this.evalVar(node, tuple);
            case 'Const':
                return node.value;
            case 'NullTest':
                return this.evalNullTest(node, tuple);
            default:
                logger.warn('Unknown expression node type', { 
                    file: 'expr_state.js', 
                    line: 35, 
                    data: { type: node.type } 
                });
                return true;
        }
    }

    evalBoolExpr(node, tuple) {
        const { boolop, args } = node;
        
        if (boolop === 'AND') {
            for (const arg of args) {
                if (!this.evalNode(arg, tuple)) return false;
            }
            return true;
        } else if (boolop === 'OR') {
            for (const arg of args) {
                if (this.evalNode(arg, tuple)) return true;
            }
            return false;
        } else if (boolop === 'NOT') {
            return !this.evalNode(args[0], tuple);
        }
        
        logger.warn('Unknown boolop', { file: 'expr_state.js', line: 59, data: { boolop } });
        return false;
    }

    evalOpExpr(node, tuple) {
        const { opname, left, right } = node;
        const leftVal = this.evalNode(left, tuple);
        const rightVal = this.evalNode(right, tuple);

        let result = false;
        switch (opname) {
            case '=': result = leftVal === rightVal; break;
            case '!=': result = leftVal !== rightVal; break;
            case '<': result = leftVal < rightVal; break;
            case '>': result = leftVal > rightVal; break;
            case '<=': result = leftVal <= rightVal; break;
            case '>=': result = leftVal >= rightVal; break;
            case '+': result = leftVal + rightVal; break;
            case '-': result = leftVal - rightVal; break;
            case '*': result = leftVal * rightVal; break;
            default:
                logger.warn('Unknown operator', { file: 'expr_state.js', line: 82, data: { opname } });
        }
        
        logger.debug('Operator evaluated', { 
            file: 'expr_state.js', 
            line: 86, 
            data: { opname, leftVal, rightVal, result } 
        });
        return result;
    }

    evalVar(node, tuple) {
        const { varname } = node;
        const val = tuple[varname];
        logger.debug('Variable evaluated', { 
            file: 'expr_state.js', 
            line: 95, 
            data: { varname, val } 
        });
        return val;
    }

    evalNullTest(node, tuple) {
        const { arg, nulltesttype } = node;
        const val = this.evalNode(arg, tuple);
        
        const isNull = val === null || val === undefined;
        const result = nulltesttype === 'IS_NULL' ? isNull : !isNull;
        
        logger.debug('Null test evaluated', { 
            file: 'expr_state.js', 
            line: 108, 
            data: { nulltesttype, isNull, result } 
        });
        return result;
    }
}
